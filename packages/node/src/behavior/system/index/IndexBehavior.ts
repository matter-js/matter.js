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
 * The Descriptor's PartsList of an endpoint whose device type names every descendant (root node, aggregator, bridged
 * node) is built from this index, so those endpoints need it.
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
     * Ensure that no endpoint of the node that {@link claimant} belongs to or joins, other than {@link claimant}, holds
     * {@link number}.  Does nothing if that tree is not part of a node.
     *
     * A claimant that joins the tree under {@link parent} yields to any holder.  A claimant that is already part of the
     * tree ({@link parent} omitted) yields only to an installed holder, as the endpoints of a tree built before the node
     * starts claim their numbers in the order they install.
     *
     * @throws {@link IdentityConflictError} if another endpoint holds the number
     * @internal
     */
    static assertNumberAvailable(claimant: Endpoint, number: number, parent?: Endpoint) {
        const holder = IndexBehavior.holderOf(parent ?? claimant, number);
        if (holder === undefined || holder === claimant || (parent === undefined && !holder.lifecycle.isInstalled)) {
            return;
        }
        throw new IdentityConflictError(
            `Cannot assign endpoint number ${number} to ${claimant} because ${holder} already holds it`,
        );
    }

    /**
     * The endpoint of {@link tree}'s node that holds {@link number}, including the node root for 0, or undefined if
     * {@link tree} is not part of a node.  The tree also holds the endpoints that are not installed, such as while the
     * node resets or before it starts, so unlike the index this answers in every state of the node.  Of several holders,
     * which a tree built before start may contain, the installed one is preferred.
     *
     * Visits the whole tree, so the server interaction path uses the index instead.
     *
     * @internal
     */
    static holderOf(tree: Endpoint, number: number): Endpoint | undefined {
        const root = rootOf(tree);
        if (root === undefined || number === 0) {
            return root;
        }

        let holder: Endpoint | undefined;
        const findInstalled = (endpoint: Endpoint): boolean => {
            if (!endpoint.hasParts) {
                return false;
            }
            for (const part of endpoint.parts) {
                if (part.maybeNumber === number) {
                    if (part.lifecycle.isInstalled) {
                        holder = part;
                        return true;
                    }
                    holder ??= part;
                }
                if (findInstalled(part)) {
                    return true;
                }
            }
            return false;
        };
        findInstalled(root);
        return holder;
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
