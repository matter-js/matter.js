/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AsyncObservable, Diagnostic, ImplementationError, Lifecycle, Logger, Observable } from "#general";
import type { Node } from "#node/Node.js";
import type { Endpoint } from "../Endpoint.js";

const logger = Logger.get("PartLifecycle");

/**
 * State related to a {@link Endpoint}'s lifecycle.
 */
export class EndpointLifecycle {
    #endpoint: Endpoint;
    #isEssential: boolean;
    #isInstalled = false;
    #isReady = false;
    #isPartsReady = false;
    #hasId = false;
    #hasNumber = false;
    #installed = Observable<[]>(error => this.emitError("installed", error));
    #ready = Observable<[]>(error => this.emitError("ready", error));
    #partsReady = Observable<[]>(error => this.emitError("partsReady", error));
    #destroying = Observable<[]>(error => this.emitError("destroying", error));
    #destroyed = Observable<[]>(error => this.emitError("destroyed", error));
    #changed = Observable<[type: EndpointLifecycle.Change, endpoint: Endpoint]>(error =>
        this.emitError("changed", error),
    );
    #reset = AsyncObservable<[]>();
    #queuedUpdates?: Array<EndpointLifecycle.Change>;

    /**
     * Emitted when an endpoint is installed into an initialized owner.
     */
    get installed() {
        return this.#installed;
    }

    /**
     * Emitted when an endpoint is fully initialized excepting children.
     */
    get ready() {
        return this.#ready;
    }

    /**
     * Emitted when an endpoint is fully initialized including children.
     */
    get partsReady() {
        return this.#partsReady;
    }

    /**
     * @deprecated use {@link partsReady}
     */
    get treeReady() {
        return this.partsReady;
    }

    /**
     * Emitted when the endpoint begins destruction.
     */
    get destroying() {
        return this.#destroying;
    }

    /**
     * Emitted when the endpoint is destroyed.
     */
    get destroyed() {
        return this.#destroyed;
    }

    /**
     * Bubbling event indicating changes to endpoint structure.
     */
    get changed() {
        return this.#changed;
    }

    /**
     * Emitted on factory reset.
     */
    get reset() {
        return this.#reset;
    }

    /**
     * Is the {@link Endpoint} installed in a {@link Node}?
     */
    get isInstalled() {
        return this.#isInstalled;
    }

    /**
     * Is the {@link Endpoint} fully initialized, excepting children?
     */
    get isReady() {
        return this.#isReady;
    }

    /**
     * Is the {@link Endpoint} fully initialized, including children?
     */
    get isPartsReady() {
        return this.#isPartsReady;
    }

    /**
     * @deprecated use {@link isPartsReady}
     */
    get isTreeReady() {
        return this.isPartsReady;
    }

    /**
     * Designates endpoint as essential.
     *
     * By default endpoints are considered "essential".  An essential endpoint must initialize successfully or an error
     * is thrown.  Non-essential endpoints may be installed even if they have errors.
     *
     * You may configure this property via {@link Endpoint.Configuration#isEssential}.
     */
    get isEssential() {
        return this.#isEssential;
    }

    /**
     * Does the endpoint have an ID?
     */
    get hasId() {
        return this.#hasId;
    }

    /**
     * Does the endpoint have an endpoint number?
     */
    get hasNumber() {
        return this.#hasNumber;
    }

    constructor(endpoint: Endpoint, isEssential?: boolean) {
        this.#endpoint = endpoint;
        this.#isEssential = isEssential ?? true;

        // Bubble crash events
        endpoint.construction.change.on(status => {
            if (status === Lifecycle.Status.Crashed) {
                this.change(EndpointLifecycle.Change.Crashed);
            }
        });
    }

    /**
     * Bubble a lifecycle change event from a child.
     */
    bubble(type: EndpointLifecycle.Change, endpoint: Endpoint) {
        this.#changed.emit(type, endpoint);
    }

    /**
     * Inform the Lifecycle of a change in lifecycle.
     */
    change(type: EndpointLifecycle.Change) {
        // Update state
        switch (type) {
            case EndpointLifecycle.Change.Installed:
                this.#isInstalled = true;
                break;

            case EndpointLifecycle.Change.Destroying:
                this.#isReady = false;
                break;

            case EndpointLifecycle.Change.Ready:
                // Sanity checks
                if (!this.#hasId) {
                    throw new ImplementationError("Endpoint reports as ready but has no ID assigned");
                }
                if (!this.#hasNumber) {
                    throw new ImplementationError("Endpoint reports as ready but has no number assigned");
                }
                this.#isReady = true;
                break;

            case EndpointLifecycle.Change.PartsReady:
                // Sanity checks
                if (!this.#isReady) {
                    throw new ImplementationError("Endpoint reports as parts-ready but is not itself ready");
                }
                this.#isPartsReady = true;
                break;

            case EndpointLifecycle.Change.IdAssigned:
                this.#hasId = true;
                break;

            case EndpointLifecycle.Change.NumberAssigned:
                this.#hasNumber = true;
                break;
        }

        // We want events to trigger in correct order but some of them cascade.
        // So if we're currently emitting, enqueue
        if (this.#queuedUpdates) {
            this.#queuedUpdates?.push(type);
            return;
        }

        // Emit events
        this.#queuedUpdates = [type];
        try {
            while (this.#queuedUpdates.length) {
                const type = this.#queuedUpdates[0];
                this.#queuedUpdates.shift();

                // Emit change event
                this.#changed.emit(type, this.#endpoint);

                // Emit endpoint-specific events
                const observable = (this as unknown as Record<string, Observable>)[type];
                if (observable !== undefined) {
                    observable.emit();
                }
            }
        } finally {
            this.#queuedUpdates = undefined;
        }
    }

    protected emitError(name: string, error: Error) {
        logger.error("Unhandled error in", Diagnostic.strong(`${this.#endpoint}.lifecycle.${name}`), "handler:", error);
    }

    /**
     * Revert to uninstalled state.
     */
    resetting() {
        this.#isInstalled = this.#isReady = this.#isPartsReady = false;
    }
}

export namespace EndpointLifecycle {
    export enum Change {
        Installed = "installed",
        Ready = "ready",
        PartsReady = "partsReady",
        Crashed = "crashed",
        Destroying = "destroying",
        Destroyed = "destroyed",
        ServersChanged = "serversChanged",
        ClientsChanged = "clientsChanged",
        IdAssigned = "idAssigned",
        NumberAssigned = "numberAssigned",
    }
}
