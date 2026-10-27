/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientNodeFactory } from "#node/client/ClientNodeFactory.js";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import {
    Abort,
    CancelablePromise,
    ChannelType,
    Diagnostic,
    asError,
    Duration,
    Logger,
    MaybePromise,
    withTimeout,
} from "@matter/general";
import { CommissionableDevice, CommissionableDeviceIdentifiers, Scanner, ScannerSet } from "@matter/protocol";
import { DiscoveryCapabilitiesBitmap, TypeFromPartialBitSchema, VendorId } from "@matter/types";
import { ControllerBehavior } from "../ControllerBehavior.js";
import { ActiveDiscoveries } from "./ActiveDiscoveries.js";
import { DeviceNotDiscoveredError, DiscoveryAggregateError, NoDiscoveryTransportError } from "./DiscoveryError.js";

const logger = Logger.get("Discovery");

/**
 * Discovery of commissionable devices.
 *
 * This is a cancelable promise; use cancel() or the `abort` option to terminate discovery.  A cancel, an abort, or
 * the failure of every scanner interrupts discovery: it stops scanning and rejects with that reason once it has wound
 * down.  The failure of only some scanners is logged and does not interrupt.  An interruption after the discovery has
 * its result, such as a candidate that won PASE, is ignored and the discovery completes with that result.
 */
export abstract class Discovery<T = unknown> extends CancelablePromise<T> {
    #abortReason?: Error;
    #callerAbort?: Abort;
    #localError?: Error;
    #unusableDevices = new Set<string>();
    #preparing = new Set<Promise<void>>();
    #scannerCount?: number;
    #scannerErrors = new Array<Error>();
    #isStopped = false;
    #stopDiscovery?: () => void;
    #owner: ServerNode;
    #options: Discovery.Options;
    #resolve: (value: T) => void;
    #reject: (cause?: any) => void;
    #settled?: Promise<void>;
    #resolveSettled?: () => void;

    constructor(owner: ServerNode, options: Discovery.Options | undefined) {
        let resolve: (value: T) => void, reject: (cause?: any) => void;
        super((resolver, rejecter) => {
            resolve = resolver;
            reject = rejecter;
        });

        this.#resolve = result => {
            this.#isStopped = true;
            this.#callerAbort?.close();
            this.#owner.env.get(ActiveDiscoveries).delete(this);
            resolve!(result);
            this.#resolveSettled?.();
        };
        this.#reject = cause => {
            this.#isStopped = true;
            this.#callerAbort?.close();
            this.#owner.env.get(ActiveDiscoveries).delete(this);
            // An accepted interruption decides every rejection, whichever phase fails afterwards
            const reason = this.#abortReason;
            if (reason !== undefined && cause !== reason) {
                logger.debug(`${this} was interrupted, so it reports the interruption instead of:`, cause);
            }
            reject!(reason ?? cause);
            this.#resolveSettled?.();
        };

        owner.env.get(ActiveDiscoveries).add(this);

        this.#owner = owner;
        this.#options = options ?? {};

        queueMicrotask(this.#initializeController.bind(this));
    }

    get settled() {
        if (this.#settled === undefined) {
            this.#settled = new Promise(resolve => (this.#resolveSettled = resolve));
        }
        return this.#settled;
    }

    protected get owner(): ServerNode {
        return this.#owner;
    }

    protected abstract onDiscovered(node: ClientNode): void;
    protected abstract onComplete(): MaybePromise<T>;

    /**
     * Terminate discovery.
     *
     * This will not abort node initialization but it will terminate any active discoveries.  The discovery result will
     * be the same as if the discovery had timed out.
     *
     * To abort the operation due to error use {@link cancel}.
     */
    stop() {
        if (this.#isStopped) {
            return;
        }

        this.#isStopped = true;
        this.#stopDiscovery?.();
    }

    override toString() {
        const description = this.#description;
        if (description === undefined) {
            return "node discovery";
        }
        return `discovery of ${description}`;
    }

    get #description() {
        if ("instanceId" in this.#options) {
            return `node instance ${this.#options.instanceId}`;
        }

        if ("longDiscriminator" in this.#options) {
            return `node with discriminator ${this.#options.longDiscriminator}`;
        }

        if ("shortDiscriminator" in this.#options) {
            return `node with discriminator ${this.#options.shortDiscriminator}`;
        }

        if ("productId" in this.#options && this.#options.productId !== undefined) {
            if ("vendorId" in this.#options) {
                return `product ${this.#options.productId} from vendor ${this.#options.vendorId}`;
            }
            return `product ${this.#options.productId}`;
        }

        if ("vendorId" in this.#options) {
            return `node from vendor ${this.#options.vendorId}`;
        }

        if ("deviceType" in this.#options) {
            return `node with device type ${this.#options.deviceType}`;
        }

        return undefined;
    }

    /**
     * The device to look for, without the options that steer discovery itself.
     */
    get #identifier(): CommissionableDeviceIdentifiers {
        const options = this.#options;
        const identifier: {
            instanceId?: string;
            longDiscriminator?: number;
            shortDiscriminator?: number;
            vendorId?: VendorId;
            productId?: number;
            deviceType?: number;
        } = {};

        if ("instanceId" in options) {
            identifier.instanceId = options.instanceId;
        }
        if ("longDiscriminator" in options) {
            identifier.longDiscriminator = options.longDiscriminator;
        }
        if ("shortDiscriminator" in options) {
            identifier.shortDiscriminator = options.shortDiscriminator;
        }
        if ("vendorId" in options) {
            identifier.vendorId = options.vendorId;
        }
        if ("productId" in options) {
            identifier.productId = options.productId;
        }
        if ("deviceType" in options) {
            identifier.deviceType = options.deviceType;
        }

        return identifier;
    }

    protected override onCancel(reason: Error) {
        this.#interrupt(reason);
    }

    /**
     * Called when a cancel, an abort or the failure of every scanner interrupts discovery.  Returns `false` if the
     * discovery already has its result, so the interruption is ignored and the discovery completes normally.
     */
    protected onInterrupt(_reason: Error) {
        return true;
    }

    #interrupt(reason: Error) {
        if (!this.onInterrupt(reason)) {
            logger.info(`${this} already has its result and ignores the interruption:`, reason);
            return;
        }
        this.#abortReason ??= reason;
        this.stop();
    }

    /**
     * Step 1 - ensure node is initialized as a controller
     */
    #initializeController() {
        // An already aborted signal cancels synchronously, which needs subclass state to exist
        const { abort } = this.#options;
        if (abort !== undefined) {
            this.#callerAbort = new Abort({ abort, handler: reason => this.cancel(reason) });
        }

        let controllerInitialized;
        try {
            this.#owner.behaviors.require(ControllerBehavior);
            controllerInitialized = this.#owner.act(agent => agent.load(ControllerBehavior));
        } catch (e) {
            this.#reject(e);
            return;
        }

        if (MaybePromise.is(controllerInitialized)) {
            controllerInitialized.then(this.#startNode.bind(this), this.#reject);
            return;
        }

        this.#startNode();
    }

    /**
     * Step 2 - ensure node is online
     */
    #startNode() {
        if (this.#isStopped) {
            this.#afterDiscovery();
            return;
        }

        if (this.#owner.lifecycle.isOnline) {
            this.#performDiscovery();
            return;
        }

        this.#owner.start().then(this.#performDiscovery.bind(this), this.#reject);
    }

    /**
     * Step 3 - perform actual discovery
     */
    #performDiscovery() {
        if (this.#isStopped) {
            this.#afterDiscovery();
            return;
        }

        const { discoveryCapabilities, id } = this.#options as Discovery.InstanceOptions;

        const available = this.#owner.env.get(ScannerSet);
        const scanners = discoveryCapabilities ? available.select(discoveryCapabilities) : [...available];

        this.#reportTransports(available, scanners, discoveryCapabilities);

        this.#scannerCount = scanners.length;

        const identifier = this.#identifier;
        const factory = this.#owner.env.get(ClientNodeFactory);
        const promises = new Array<Promise<unknown>>();
        const cancelSignal = new Promise<void>(resolve => (this.#stopDiscovery = resolve));
        for (const scanner of scanners) {
            promises.push(
                scanner
                    .findCommissionableDevicesContinuously(
                        identifier,
                        descriptor => this.#prepare(descriptor, factory, id),
                        undefined,
                        cancelSignal,
                    )
                    .catch(error => this.#scannerFailed(scanner, error)),
            );
        }

        let promise = Promise.all(promises);

        if (this.#options.timeout !== undefined) {
            promise = withTimeout(this.#options.timeout, promise, this.stop.bind(this));
        }

        promise
            .then(() => this.#prepared())
            .then(this.#afterDiscovery.bind(this))
            .catch(this.#reject);
    }

    /**
     * Prepares a device a scanner reported.  Discovery completes only after every preparation settled, so the outcome
     * sees each found device or its error.
     */
    #prepare(descriptor: CommissionableDevice, factory: ClientNodeFactory, id: string | undefined) {
        const preparation = this.#tryFound(descriptor, factory, id).finally(() => this.#preparing.delete(preparation));
        this.#preparing.add(preparation);
    }

    async #tryFound(descriptor: CommissionableDevice, factory: ClientNodeFactory, id: string | undefined) {
        try {
            await this.#found(descriptor, factory, id);
        } catch (error) {
            this.#localFailure(descriptor.deviceIdentifier, error);
        }
    }

    async #prepared() {
        while (this.#preparing.size) {
            await Promise.all(this.#preparing);
        }
    }

    /**
     * Prepares the node for a device a scanner reported and hands it to {@link onDiscovered}.
     */
    async #found(descriptor: CommissionableDevice, factory: ClientNodeFactory, id: string | undefined) {
        // Skip nodes that are already commissioned — they cannot be re-commissioned and should not be surfaced by a
        // new commissioning discovery flow.
        let node = factory.find(descriptor);
        if (node?.lifecycle.isCommissioned) {
            node = undefined;
        }

        if (node) {
            // Found a known uncommissioned node; refresh its commissioning metadata BEFORE notifying onDiscovered.
            // Firing the commission attempt before the refresh lands lets the expired-node cull observe stale
            // `discoveredAt` and delete the node mid-commission, which collapses the BehaviorBacking and surfaces as
            // "Datasource not yet initialized".
            await node.act(async agent => {
                // Open the transaction asynchronously so a concurrent commission on this node serializes us; a plain
                // synchronous write throws SynchronousTransactionConflictError mid-commission and that rejection
                // crashes the process.
                const { transaction } = agent.context;
                await transaction.addResources(agent.commissioning);
                await transaction.begin();
                agent.commissioning.descriptor = descriptor;
            });
        } else {
            // Wait for construction so that node.state.commissioning is committed and readable by listeners.
            node = factory.create({ id, environment: this.#owner.env, commissioning: { descriptor } });
            await node.construction.ready;
        }

        this.onDiscovered(node);
    }

    /**
     * One scanner failing only loses its transport, so it is a warning and its error is kept for the final outcome.
     * Discovery is interrupted once every scanner has failed.
     */
    #scannerFailed(scanner: Scanner, error: unknown) {
        const cause = asError(error);
        logger.warn(`The ${scanner.type} scanner of ${this} failed:`, cause);
        this.#scannerErrors.push(cause);
        if (this.#scannerErrors.length === this.#scannerCount) {
            this.#interrupt(this.#scannerFailure());
        }
    }

    /** The kept scanner errors in the one shape they are reported in, whether some or all scanners failed. */
    #scannerFailure() {
        return new DiscoveryAggregateError(
            this.#scannerErrors,
            `${this} failed: ${this.#scannerErrors.length} of ${this.#scannerCount} scanner(s) failed`,
        );
    }

    /** Report the transports this discovery runs on. */
    #reportTransports(
        available: ScannerSet,
        scanners: Scanner[],
        capabilities?: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap>,
    ) {
        const bleInstalled = available.hasScannerFor(ChannelType.BLE);
        const bleUsed = scanners.some(scanner => scanner.type === ChannelType.BLE);

        const notes = new Array<string>();
        if (bleInstalled && !bleUsed) {
            notes.push("BLE not requested");
        }
        const note = notes.length ? [`(${notes.join(", ")})`] : [];

        const description = this.#description;
        if (description === undefined) {
            logger.notice("Initiating", Diagnostic.strong("node discovery"), ...note);
        } else {
            logger.notice("Initiating discovery of", Diagnostic.strong(description), ...note);
        }

        if (!scanners.length) {
            logger.warn("No scanner is available so discovery cannot find any device");
            return;
        }

        if (capabilities?.ble && !bleInstalled) {
            logger.notice("BLE and IP network discovery requested but BLE is not enabled; using IP network only");
        }
    }

    /**
     * A device was found but could not be used.  Only this device is lost, so it is a warning, once per device because
     * a scanner reports a device again on each advertisement.  The first such error replaces a "not discovered"
     * outcome because the device was there.
     */
    #localFailure(deviceIdentifier: string, error: unknown) {
        if (this.#unusableDevices.has(deviceIdentifier)) {
            logger.debug(`Still cannot use device ${deviceIdentifier} found by ${this}:`, error);
        } else {
            this.#unusableDevices.add(deviceIdentifier);
            logger.warn(`Cannot use device ${deviceIdentifier} found by ${this}:`, error);
        }
        this.#localError ??= asError(error);
    }

    /**
     * Prefers the real cause over an outcome that only reports its symptom.  A "not discovered" outcome gives way to a found device that could not be used, a scanner
     * that failed, or a controller with no scanner to find anything with.
     */
    #failure(error: unknown) {
        if (!(error instanceof DeviceNotDiscoveredError)) {
            return error;
        }
        if (this.#localError) {
            return this.#localError;
        }
        if (this.#scannerErrors.length) {
            return this.#scannerFailure();
        }
        if (this.#scannerCount === 0) {
            return new NoDiscoveryTransportError(
                `${this} cannot find anything: no scanner is installed for the requested transports`,
            );
        }
        return error;
    }

    /**
     * Step 4 - invoke completion callback
     */
    #afterDiscovery() {
        let result: MaybePromise<T>;

        try {
            result = this.onComplete();
        } catch (e) {
            this.#reject(this.#failure(e));
            return;
        }

        if (MaybePromise.is(result)) {
            result.then(this.#complete.bind(this), error => this.#reject(this.#failure(error)));
            return;
        }

        this.#complete(result);
    }

    #complete(result: T) {
        // An interruption the subclass accepted wins over whatever partial result onComplete still offers
        if (this.#abortReason) {
            this.#reject(this.#abortReason);
            return;
        }
        this.#resolve(result);
    }
}

export namespace Discovery {
    export type Options = CommissionableDeviceIdentifiers & {
        timeout?: Duration;

        /**
         * Aborting this signal has the same effect as {@link Discovery#cancel} with the abort reason.
         */
        abort?: AbortSignal;

        /**
         * The transports the device is expected to be discoverable on, as an onboarding payload states them.
         *
         * IP network discovery participates regardless of the `onIpNetwork` bit; BLE only where the payload names it.
         * Omitting this discovers on every installed transport, BLE included.
         *
         * @see {@link MatterSpecification.v161.Core} § 5.1.3.1 Table 60
         */
        discoveryCapabilities?: TypeFromPartialBitSchema<typeof DiscoveryCapabilitiesBitmap>;
    };

    export type InstanceOptions = Options & {
        /**
         * The local ID to assign the node if newly discovered.  This is the stable identifier used for the node's "id"
         * property.
         *
         * By default matter.js assigns an ID of the form "peerN".
         */
        id?: string;
    };
}
