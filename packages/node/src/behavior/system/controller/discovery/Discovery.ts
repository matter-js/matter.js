/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientNodeFactory } from "#node/client/ClientNodeFactory.js";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import {
    CancelablePromise,
    ChannelType,
    Diagnostic,
    Duration,
    Logger,
    MaybePromise,
    withTimeout,
} from "@matter/general";
import { CommissionableDeviceIdentifiers, Scanner, ScannerSet } from "@matter/protocol";
import { DiscoveryCapabilitiesBitmap, TypeFromPartialBitSchema, VendorId } from "@matter/types";
import { ControllerBehavior } from "../ControllerBehavior.js";
import { ActiveDiscoveries } from "./ActiveDiscoveries.js";
import { DiscoveryAggregateError } from "./DiscoveryError.js";

const logger = Logger.get("Discovery");

/**
 * Discovery of commissionable devices.
 *
 * This is a cancelable promise; use cancel() to terminate discovery.
 */
export abstract class Discovery<T = unknown> extends CancelablePromise<T> {
    #abortReason?: Error;
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
            this.#owner.env.get(ActiveDiscoveries).delete(this);
            resolve!(result);
            this.#resolveSettled?.();
        };
        this.#reject = cause => {
            this.#isStopped = true;
            this.#owner.env.get(ActiveDiscoveries).delete(this);
            reject!(cause);
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
        this.#abortReason = reason;
        this.stop();
    }

    /**
     * Step 1 - ensure node is initialized as a controller
     */
    #initializeController() {
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

        const identifier = this.#identifier;
        const factory = this.#owner.env.get(ClientNodeFactory);
        const promises = new Array<PromiseLike<unknown>>();
        const cancelSignal = new Promise<void>(resolve => (this.#stopDiscovery = resolve));
        for (const scanner of scanners) {
            promises.push(
                scanner.findCommissionableDevicesContinuously(
                    identifier,
                    descriptor => {
                        // Identify a known node that matches the descriptor.
                        // Skip nodes that are already commissioned — they cannot be re-commissioned and
                        // should not be surfaced by a new commissioning discovery flow.
                        let node = factory.find(descriptor);
                        if (node?.lifecycle.isCommissioned) {
                            node = undefined;
                        }

                        if (node) {
                            // Found a known uncommissioned node; refresh its commissioning metadata BEFORE notifying
                            // onDiscovered.  Firing the commission attempt before the refresh lands lets the
                            // expired-node cull observe stale `discoveredAt` and delete the node mid-commission,
                            // which collapses the BehaviorBacking and surfaces as "Datasource not yet initialized".
                            //
                            // Fire-and-forget with errors swallowed, same as the new-node branch below.
                            const reusedNode = node;
                            MaybePromise.then(
                                node.act(async agent => {
                                    // Open the transaction asynchronously so a concurrent commission on this node
                                    // serializes us; a plain synchronous write throws SynchronousTransactionConflictError
                                    // mid-commission and that rejection crashes the process.
                                    const { transaction } = agent.context;
                                    await transaction.addResources(agent.commissioning);
                                    await transaction.begin();
                                    agent.commissioning.descriptor = descriptor;
                                }),
                                () => this.onDiscovered(reusedNode),
                                () => {},
                            );
                        } else {
                            // This node is new to us — defer onDiscovered until construction completes
                            // so that node.state.commissioning is committed and readable by listeners.
                            node = factory.create({
                                id,
                                environment: this.#owner.env,
                                commissioning: { descriptor },
                            });
                            const newNode = node;
                            Promise.resolve(newNode.construction.ready).then(
                                () => this.onDiscovered(newNode),
                                () => {},
                            );
                        }
                    },
                    undefined,
                    cancelSignal,
                ),
            );
        }

        let promise = DiscoveryAggregateError.allSettled(promises, `${this} failed`);

        if (this.#options.timeout !== undefined) {
            promise = withTimeout(this.#options.timeout, promise, this.stop.bind(this));
        }

        promise.then(this.#afterDiscovery.bind(this)).catch(this.#reject);
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
     * Step 4 - invoke completion callback
     */
    #afterDiscovery() {
        let result: MaybePromise<T>;

        if (this.#abortReason) {
            this.#reject(this.#abortReason);
            return;
        }

        try {
            result = this.onComplete();
        } catch (e) {
            this.#reject(e);
            return;
        }

        if (MaybePromise.is(result)) {
            result.then(this.#resolve.bind(this), this.#reject);
            return;
        }

        this.#resolve(result);
    }
}

export namespace Discovery {
    export type Options = CommissionableDeviceIdentifiers & {
        timeout?: Duration;

        /**
         * The transports the device is expected to be discoverable on, as an onboarding payload states them.
         *
         * IP network discovery participates regardless of the `onIpNetwork` bit; BLE only where the payload names it.
         * Omitting this discovers on every installed transport, BLE included.
         *
         * @see {@link MatterSpecification.v16.Core} § 5.1.3.1 Table 60
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
