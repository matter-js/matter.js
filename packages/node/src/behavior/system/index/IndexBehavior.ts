/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { IdentityConflictError } from "#endpoint/errors.js";
import { EndpointLifecycle } from "#endpoint/properties/EndpointLifecycle.js";
import { EventEmitter, InternalError, Lifecycle, Observable } from "@matter/general";
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
        const holder = IndexBehavior.holderOf(parent, number);
        if (holder !== undefined && holder !== claimant) {
            throw new IdentityConflictError(
                `Cannot assign endpoint number ${number} to ${claimant} because ${holder} already holds it`,
            );
        }
    }

    /**
     * The endpoint the index of {@link tree}'s node holds under {@link number}.  Undefined if {@link tree} is not part
     * of a node.
     *
     * @internal
     */
    static holderOf(tree: Endpoint, number: number): Endpoint | undefined {
        return rootOf(tree)?.behaviors.internalsOf(IndexBehavior).partsByNumber[number];
    }

    /**
     * Does the index of {@link endpoint}'s node hold {@link endpoint} under its number?  False unless the node is
     * constructing or active.
     *
     * @internal
     */
    static isIndexed(endpoint: Endpoint) {
        const number = endpoint.maybeNumber;
        const root = rootOf(endpoint);
        const status = root?.construction.status;
        if (
            number === undefined ||
            number === 0 ||
            root === undefined ||
            (status !== Lifecycle.Status.Active && status !== Lifecycle.Status.Initializing)
        ) {
            return false;
        }
        return root.behaviors.internalsOf(IndexBehavior).partsByNumber[number] === endpoint;
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
            const holder = this.internal.partsByNumber[number];
            if (holder !== undefined && holder !== endpoint) {
                throw new InternalError(`Endpoint number ${number} of ${endpoint} is already indexed for ${holder}`);
            }
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

// Endpoint number 0 marks a node root; RootEndpoint cannot be imported here without an import cycle
function rootOf(endpoint: Endpoint) {
    let root: Endpoint | undefined = endpoint;
    while (root !== undefined && root.maybeNumber !== 0) {
        root = root.owner;
    }
    return root;
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
