/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import { EventEmitter, Observable } from "#general";
import { Behavior } from "../../Behavior.js";

/**
 * This behavior indexes all descendents of a {@link Endpoint} by number.
 *
 * IndexBehavior should only be present on root and aggregator parts as its presence causes the endpoint's PartsList
 * attribute to reflect a flat namespace as required by the Matter standard.
 */
export class IndexBehavior extends Behavior {
    static override readonly id = "index";

    declare internal: IndexBehavior.Internal;
    declare events: IndexBehavior.Events;

    static override readonly early = true;

    override initialize() {
        this.reactTo(this.endpoint.lifecycle.changed, this.#handleChange);
    }

    override [Symbol.asyncDispose]() {
        this.internal.changeBroadcastPending = false;
    }

    get partsById() {
        return this.internal.partsById;
    }

    get partsByNumber() {
        return this.internal.partsByNumber;
    }

    /**
     * Retrieve a {@link Endpoint} by number.
     *
     * Note that {@link internal.partsByNumber} does not include {@link endpoint} but this method will return it if the
     * number matches.
     */
    forNumber(number: number) {
        if (this.endpoint.lifecycle.hasNumber && number === this.endpoint.number) {
            return this.endpoint;
        }
        return this.internal.partsByNumber[number];
    }

    #handleChange(type: EndpointLifecycle.Change, endpoint: Endpoint) {
        switch (type) {
            case EndpointLifecycle.Change.IdAssigned:
            case EndpointLifecycle.Change.NumberAssigned:
            case EndpointLifecycle.Change.Installed:
                this.#add(endpoint);
                this.#change();
                break;

            case EndpointLifecycle.Change.Destroyed:
                this.#remove(endpoint);
                this.#change();
                break;
        }
    }

    #add(endpoint: Endpoint) {
        if (endpoint.lifecycle.hasNumber) {
            // Add to endpoint number index
            this.internal.partsByNumber[endpoint.number] = endpoint;
        }

        if (endpoint.lifecycle.hasId) {
            this.internal.partsById[endpoint.id] = endpoint;
        }

        for (const child of endpoint.parts) {
            this.#add(child);
        }
    }

    #remove(endpoint: Endpoint) {
        if (endpoint.id && this.internal.partsById[endpoint.id] === endpoint) {
            delete this.internal.partsById[endpoint.id];
        }

        if (endpoint.number !== undefined && this.internal.partsByNumber[endpoint.number] === endpoint) {
            delete this.internal.partsByNumber[endpoint.number];
        }

        for (const child of endpoint.parts) {
            this.#remove(child);
        }

        this.#change();
    }

    /**
     * Trigger change event lazily so transactions complete and we can coalesce into fewer events.
     */
    #change() {
        const { internal } = this;

        if (internal.changeBroadcastPending) {
            return;
        }

        internal.changeBroadcastPending = true;

        void Promise.resolve().then(() => {
            if (!internal.changeBroadcastPending) {
                return;
            }

            internal.changeBroadcastPending = false;
            this.events.change.emit();
        });
    }
}

export namespace IndexBehavior {
    export class Internal {
        changeBroadcastPending?: boolean;

        /**
         * Map of ID to {@link Endpoint}.
         */
        partsById = {} as Record<string, Endpoint>;

        /**
         * Map of number to {@link Endpoint}.
         */
        partsByNumber = {} as Record<string, Endpoint>;
    }

    export class Events extends EventEmitter {
        /**
         * Emitted when the index changes.
         */
        change = Observable<[]>();
    }
}
