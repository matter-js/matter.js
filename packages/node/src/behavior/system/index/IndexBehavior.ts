/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { IdentityConflictError } from "#endpoint/errors.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import { EventEmitter, Observable } from "@matter/general";
import { Behavior } from "../../Behavior.js";

/**
 * This behavior indexes all descendants of a {@link Endpoint} by number.
 *
 * IndexBehavior should only be present on root and aggregator parts as its presence causes the endpoint's PartsList
 * attribute to reflect a flat namespace as required by the Matter standard.
 *
 * Only installed endpoints are indexed.
 */
export class IndexBehavior extends Behavior {
    static override readonly id = "index";

    declare internal: IndexBehavior.Internal;
    declare readonly events: IndexBehavior.Events;

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

    /**
     * Ensure that no endpoint of the node that {@link parent} belongs to, other than {@link claimant}, holds
     * {@link number}.  Does nothing if {@link parent} is not part of a node.
     *
     * @throws {@link IdentityConflictError} if another endpoint holds the number
     * @internal
     */
    static assertNumberAvailable(claimant: Endpoint, number: number, parent: Endpoint = claimant) {
        // Endpoint number 0 marks a node root; RootEndpoint cannot be imported here without an import cycle
        let root: Endpoint | undefined = parent;
        while (root !== undefined && root.maybeNumber !== 0) {
            root = root.owner;
        }
        if (root === undefined) {
            return;
        }

        const holder = number === 0 ? root : root.behaviors.internalsOf(IndexBehavior).partsByNumber[number];
        if (holder !== undefined && holder !== claimant) {
            throw new IdentityConflictError(
                `Cannot assign endpoint number ${number} to ${claimant} because ${holder} already holds it`,
            );
        }
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
        if (!endpoint.lifecycle.isInstalled) {
            return;
        }

        const { maybeId: id, maybeNumber: number } = endpoint;

        if (number !== undefined) {
            this.internal.partsByNumber[number] = endpoint;
        }

        if (id !== undefined) {
            this.internal.partsById[id] = endpoint;
        }

        for (const child of endpoint.parts) {
            this.#add(child);
        }
    }

    #remove(endpoint: Endpoint) {
        const { maybeId: id, maybeNumber: number } = endpoint;

        if (id !== undefined && this.internal.partsById[id] === endpoint) {
            delete this.internal.partsById[id];
        }

        if (number !== undefined && this.internal.partsByNumber[number] === endpoint) {
            delete this.internal.partsByNumber[number];
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
