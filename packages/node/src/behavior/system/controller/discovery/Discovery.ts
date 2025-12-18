/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CancelablePromise, Diagnostic, Duration, Logger, MaybePromise, withTimeout } from "#general";
import { ClientNodeFactory } from "#node/client/ClientNodeFactory.js";
import type { ClientNode } from "#node/ClientNode.js";
import type { ServerNode } from "#node/ServerNode.js";
import { CommissionableDeviceIdentifiers, ScannerSet } from "#protocol";
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

        return "node discovery";
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

        const description = this.#description;
        if (description === undefined) {
            logger.info("Initiating", Diagnostic.strong("node discovery"));
        } else {
            logger.info("Initiating discovery of", Diagnostic.strong(description));
        }

        const scanners = this.#owner.env.get(ScannerSet);

        const factory = this.#owner.env.get(ClientNodeFactory);
        const promises = new Array<PromiseLike<unknown>>();
        const cancelSignal = new Promise<void>(resolve => (this.#stopDiscovery = resolve));
        for (const scanner of scanners) {
            promises.push(
                scanner.findCommissionableDevicesContinuously(
                    this.#options,
                    descriptor => {
                        // Identify a known node that matches the descriptor
                        let node = factory.find(descriptor);

                        if (node) {
                            // Found a known node; update its commissioning metadata
                            const updatePromise = node.act(agent => {
                                agent.commissioning.descriptor = descriptor;
                            });
                            if (MaybePromise.is(updatePromise)) {
                                promises.push(updatePromise);
                            }
                        } else {
                            // This node is new to us
                            node = factory.create({
                                id: (this.#options as Discovery.InstanceOptions).id,
                                environment: this.#owner.env,
                                commissioning: { descriptor },
                            });
                        }

                        this.onDiscovered(node);
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
    };

    export type InstanceOptions = Options & {
        /**
         * The local ID to assign the node if newly discovered.  This is the stable identifier used for the node's "id"
         * property.
         *
         * By default matter.js assigns an ID of the form "nodeN".
         */
        id?: string;
    };
}
