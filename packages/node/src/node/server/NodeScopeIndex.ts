/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { DeviceTypeScopeIndex, DeviceTypeValidationPass } from "@matter/model";
import { Presence, ServerEndpointFacts } from "./ServerEndpointFacts.js";

/**
 * What the device type validation of one server node keeps of its tree across passes: the recorded entry of each
 * judged endpoint, the reaching endpoints of each node scope and the parts of each endpoint by device type.
 *
 * The owner reports every lifecycle change of the node's endpoints and every `DeviceTypeList` change through
 * {@link noteChanged}, a recording pass through {@link recorded}, a destroyed or reset endpoint through
 * {@link removed} and a factory reset through {@link clear}.
 *
 * The reaching endpoints of every node scope are kept together and discarded together, at the first read after a
 * noted change to a node endpoint that bounds a kept scope or to a present endpoint that reaches now. Changes are not
 * collected while nothing is kept.
 *
 * The parts of an endpoint by device type are collected on first request and kept up to date with the device types
 * the facts answer at each noted change.
 */
export class NodeScopeIndex implements DeviceTypeScopeIndex<Endpoint> {
    readonly #facts: ServerEndpointFacts;
    readonly #entries = new Map<Endpoint, NodeScopeIndex.Entry>();
    readonly #reaching = new Map<Endpoint, Endpoint[]>();
    readonly #boundaries = new Set<Endpoint>();
    readonly #changed = new Set<Endpoint>();
    readonly #listings = new Map<Endpoint, Map<number, Set<Endpoint>>>();
    readonly #listed = new Map<Endpoint, readonly number[]>();

    constructor(facts: ServerEndpointFacts) {
        this.#facts = facts;
    }

    /**
     * What the last recording pass read of {@link endpoint}.
     */
    entryOf(endpoint: Endpoint) {
        return this.#entries.get(endpoint);
    }

    recorded(endpoint: Endpoint, entry: NodeScopeIndex.Entry) {
        this.#entries.set(endpoint, entry);
    }

    /**
     * Drop the recorded entry of {@link endpoint}, as if no pass had recorded it.
     */
    forget(endpoint: Endpoint) {
        this.#entries.delete(endpoint);
    }

    /**
     * Widen the recorded reach of {@link owner}, which is not a node endpoint, by that of a descendant destroyed before
     * it, so the owner's removal answers for the descendant.
     */
    widen(owner: Endpoint, reach: DeviceTypeValidationPass.Reach) {
        const entry = this.#entries.get(owner);
        if (entry !== undefined && !entry.isNodeEndpoint && reach > entry.reach) {
            this.#entries.set(owner, { ...entry, reach });
        }
    }

    noteChanged(endpoint: Endpoint) {
        if (this.#reaching.size) {
            this.#changed.add(endpoint);
        }

        const owner = endpoint.owner;
        if (owner !== undefined && this.#listings.has(owner)) {
            this.#unlist(owner, endpoint);
            this.#list(owner, endpoint);
        }
    }

    /**
     * Drop what is kept of {@link endpoint}, which is destroyed or reset.
     *
     * @returns the endpoint's recorded entry
     */
    removed(endpoint: Endpoint) {
        const entry = this.#entries.get(endpoint);
        this.#entries.delete(endpoint);
        this.#listings.delete(endpoint);

        const owner = endpoint.owner;
        if (owner !== undefined) {
            this.#unlist(owner, endpoint);
        }
        this.#listed.delete(endpoint);

        for (const [nodeEndpoint, reaching] of this.#reaching) {
            if (reaching.includes(endpoint)) {
                this.#reaching.set(
                    nodeEndpoint,
                    reaching.filter(other => other !== endpoint),
                );
            }
        }

        return entry;
    }

    clear() {
        this.#entries.clear();
        this.#listings.clear();
        this.#listed.clear();
        this.#discardReaching();
    }

    reachingOf(nodeEndpoint: Endpoint, pass: DeviceTypeValidationPass<Endpoint>): readonly Endpoint[] {
        this.#revise(pass);

        let reaching = this.#reaching.get(nodeEndpoint);
        if (reaching === undefined) {
            const scanned = pass.scanReaching(nodeEndpoint);
            for (const boundary of scanned.boundaries) {
                this.#boundaries.add(boundary);
            }
            reaching = scanned.reaching;
            this.#reaching.set(nodeEndpoint, reaching);
        }

        const inScope = reaching.filter(endpoint => pass.isInScope(endpoint, nodeEndpoint));
        if (inScope.length !== reaching.length) {
            // An endpoint below a new node endpoint returns once that stops being one, which changes no boundary
            this.#reaching.set(
                nodeEndpoint,
                reaching.filter(
                    endpoint => inScope.includes(endpoint) || this.#facts.presenceOf(endpoint) !== Presence.Detached,
                ),
            );
        }
        return inScope;
    }

    partsListing(parent: Endpoint, deviceTypeId: number): Iterable<Endpoint> {
        return this.listingsOf(parent).get(deviceTypeId) ?? [];
    }

    /**
     * The parts of {@link parent} by the device types the facts answer for each, without parts that are detached or
     * crashed, whose device types validation does not read.
     */
    listingsOf(parent: Endpoint): ReadonlyMap<number, ReadonlySet<Endpoint>> {
        let listings = this.#listings.get(parent);
        if (listings === undefined) {
            listings = new Map();
            this.#listings.set(parent, listings);
            for (const part of this.#facts.partsOf(parent)) {
                this.#list(parent, part);
            }
        }
        return listings;
    }

    /**
     * The reaching endpoints kept for {@link nodeEndpoint}, undefined while none are kept.
     */
    keptOf(nodeEndpoint: Endpoint): readonly Endpoint[] | undefined {
        return this.#reaching.get(nodeEndpoint);
    }

    #revise(pass: DeviceTypeValidationPass<Endpoint>) {
        for (const endpoint of this.#changed) {
            if (
                this.#boundaries.has(endpoint) ||
                (this.#facts.isPresent(endpoint) && pass.reachOf(endpoint) !== DeviceTypeValidationPass.Reach.None)
            ) {
                this.#discardReaching();
                return;
            }
        }
        this.#changed.clear();
    }

    #discardReaching() {
        this.#reaching.clear();
        this.#boundaries.clear();
        this.#changed.clear();
    }

    #list(parent: Endpoint, part: Endpoint) {
        const listings = this.#listings.get(parent);
        if (listings === undefined || !parent.parts.has(part)) {
            return;
        }
        const presence = this.#facts.presenceOf(part);
        if (presence === Presence.Detached || presence === Presence.Crashed) {
            return;
        }

        const ids = [...this.#facts.deviceTypeIdsOf(part)];
        this.#listed.set(part, ids);
        for (const id of ids) {
            let listed = listings.get(id);
            if (listed === undefined) {
                listed = new Set();
                listings.set(id, listed);
            }
            listed.add(part);
        }
    }

    #unlist(parent: Endpoint, part: Endpoint) {
        const ids = this.#listed.get(part);
        if (ids === undefined) {
            return;
        }
        this.#listed.delete(part);

        const listings = this.#listings.get(parent);
        if (listings === undefined) {
            return;
        }
        for (const id of ids) {
            const listed = listings.get(id);
            listed?.delete(part);
            if (listed?.size === 0) {
                listings.delete(id);
            }
        }
    }
}

export namespace NodeScopeIndex {
    /**
     * What the recorded judgement of an endpoint read that decides which other endpoints a change to it affects.
     */
    export interface Entry {
        duplicate: boolean;
        isNodeEndpoint: boolean;

        /**
         * The reach of the endpoint's facts, widened by those of descendants destroyed before it. Always
         * {@link DeviceTypeValidationPass.Reach.None} for a node endpoint, whose node scope is its own subtree.
         */
        reach: DeviceTypeValidationPass.Reach;
    }
}
