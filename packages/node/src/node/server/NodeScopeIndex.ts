/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Endpoint } from "#endpoint/Endpoint.js";
import { DeviceTypeScopeIndex, DeviceTypeValidationPass, ReachingEndpoints } from "@matter/model";
import { Presence, ServerEndpointFacts } from "./ServerEndpointFacts.js";

/**
 * What the device type validation of one server node keeps of its tree across passes: the recorded entry of each
 * judged endpoint, the reaching endpoints of each node scope and the parts of each endpoint by device type.
 *
 * The owner reports every lifecycle change of the node's endpoints and every `DeviceTypeList` change through
 * {@link noteChanged}, a change to what a recorded entry read through {@link invalidate}, a recording pass through
 * {@link recorded}, a destroyed or reset endpoint through {@link removed} and a factory reset through {@link clear}.
 *
 * The reaching endpoints of a node scope are collected by a walk of the scope on first request and then kept equal to
 * what a walk would find: at the first read after noted changes, each noted endpoint and its descendants leave the
 * scope and join it again as they stand now. Changes are not collected while no scope is kept.
 *
 * The parts of an endpoint by device type are collected on first request and kept up to date with the device types
 * the facts answer at each noted change. Where the number of present parts of a device type passes from one to two or
 * back, the Base `Duplicate` condition of each of those parts may flip, so each becomes a {@link suspectsOf suspect}
 * and its contribution to its node scope is read again.
 */
export class NodeScopeIndex implements DeviceTypeScopeIndex<Endpoint> {
    readonly #facts: ServerEndpointFacts;
    readonly #entries = new Map<Endpoint, NodeScopeIndex.Entry>();
    readonly #scopes = new Map<Endpoint, KeptScope>();
    readonly #changed = new Set<Endpoint>();
    readonly #listings = new Map<Endpoint, Listing>();
    readonly #listed = new Map<Endpoint, Listed>();
    readonly #readersJudgedUnder = new Map<Endpoint, string>();

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
        this.#listingOfOwner(endpoint)?.suspects.delete(endpoint);
    }

    /**
     * Drop the recorded entry of {@link endpoint}, whose device types or server clusters changed, and
     * suspect it until a pass records it again. An entry is kept only while a fresh judgement would record the same, or a
     * reach {@link widen widened} beyond it.
     *
     * @returns the entry recorded before the change
     */
    invalidate(endpoint: Endpoint) {
        const entry = this.#entries.get(endpoint);
        this.#entries.delete(endpoint);
        this.#listingOfOwner(endpoint)?.suspects.add(endpoint);
        return entry;
    }

    /**
     * Drop the recorded entry of {@link endpoint}, as if no pass had recorded it. Condition readers are no longer known
     * to be judged under any conditions.
     *
     * @internal tests only
     */
    forget(endpoint: Endpoint) {
        this.#entries.delete(endpoint);
        this.#readersJudgedUnder.clear();
        this.#listingOfOwner(endpoint)?.suspects.add(endpoint);
    }

    /**
     * The conditions of {@link nodeEndpoint}, as the owner compares them, that every recorded condition reader of
     * {@link nodeEndpoint} was last judged under; undefined when that is not known.
     */
    readersJudgedUnder(nodeEndpoint: Endpoint) {
        return this.#readersJudgedUnder.get(nodeEndpoint);
    }

    readersJudged(nodeEndpoint: Endpoint, conditions: string | undefined) {
        if (conditions === undefined) {
            this.#readersJudgedUnder.delete(nodeEndpoint);
        } else {
            this.#readersJudgedUnder.set(nodeEndpoint, conditions);
        }
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
        if (this.#scopes.size) {
            this.#changed.add(endpoint);
        }

        const listing = this.#listingOfOwner(endpoint);
        if (listing !== undefined) {
            this.#relist(listing, endpoint);
            listing.suspects.add(endpoint);
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

        const listing = this.#listingOfOwner(endpoint);
        if (listing !== undefined) {
            this.#relist(listing, endpoint, true);
            listing.suspects.delete(endpoint);
        }
        this.#listed.delete(endpoint);

        this.#scopes.delete(endpoint);
        this.#readersJudgedUnder.delete(endpoint);
        for (const scope of this.#scopes.values()) {
            scope.listing.delete(endpoint);
            if (scope.reaching.delete(endpoint) || scope.boundaries.delete(endpoint)) {
                scope.kept = undefined;
            }
        }

        return entry;
    }

    clear() {
        this.#entries.clear();
        this.#readersJudgedUnder.clear();
        this.#listings.clear();
        this.#listed.clear();
        this.#scopes.clear();
        this.#changed.clear();
    }

    reachingOf(nodeEndpoint: Endpoint, pass: DeviceTypeValidationPass<Endpoint>): ReachingEndpoints<Endpoint> {
        return this.#scopeOf(nodeEndpoint, pass).reaching;
    }

    scopeListing(nodeEndpoint: Endpoint, deviceTypeId: number, pass: DeviceTypeValidationPass<Endpoint>) {
        return this.#scopeOf(nodeEndpoint, pass).listing.byId.get(deviceTypeId) ?? [];
    }

    partsListing(parent: Endpoint, deviceTypeId: number): Iterable<Endpoint> {
        return this.#listingOf(parent).byId.get(deviceTypeId) ?? [];
    }

    /**
     * The parts of {@link parent} by the device types the facts answer for each, without parts that are detached or
     * crashed, whose device types validation does not read; undefined while none are kept.
     *
     * @internal tests only
     */
    listingsOf(parent: Endpoint): ReadonlyMap<number, ReadonlySet<Endpoint>> | undefined {
        return this.#listings.get(parent)?.byId;
    }

    /**
     * The parts of {@link parent} whose Base `Duplicate` condition may differ from what their recorded entry read, or
     * that have none: every part that changed, was forgotten or shares a device type whose number of present parts
     * passed from one to two or back since its last recording pass, and every part when the listing of {@link parent}
     * was collected. A part stays a suspect until a pass records it or the owner {@link settled settles} it.
     */
    suspectsOf(parent: Endpoint): ReadonlySet<Endpoint> {
        return this.#listingOf(parent).suspects;
    }

    /**
     * Stop suspecting {@link part}, whose recorded entry matches it.
     */
    settled(part: Endpoint) {
        this.#listingOfOwner(part)?.suspects.delete(part);
    }

    /**
     * The reaching endpoints kept for {@link nodeEndpoint} in tree order, undefined while none are kept, as the last
     * read left them; changes noted since are applied by the next read. The same array while no change applied since
     * altered what is kept of the scope.
     *
     * @internal tests only
     */
    keptOf(nodeEndpoint: Endpoint): readonly Endpoint[] | undefined {
        const scope = this.#scopes.get(nodeEndpoint);
        if (scope === undefined) {
            return;
        }
        scope.kept ??= ReachingEndpoints.inTreeOrder([...scope.reaching], this.#facts);
        return scope.kept;
    }

    /**
     * The endpoints of the node scope kept for {@link nodeEndpoint} by device type, undefined while none are kept, as
     * the last read left them.
     *
     * @internal tests only
     */
    keptListingOf(nodeEndpoint: Endpoint): ReadonlyMap<number, ReadonlySet<Endpoint>> | undefined {
        return this.#scopes.get(nodeEndpoint)?.listing.byId;
    }

    #scopeOf(nodeEndpoint: Endpoint, pass: DeviceTypeValidationPass<Endpoint>) {
        this.#revise(pass);

        let scope = this.#scopes.get(nodeEndpoint);
        if (scope === undefined) {
            const { reaching, boundaries } = pass.scanReaching(nodeEndpoint);
            scope = {
                reaching: new ReachingEndpoints(reaching),
                boundaries: new Set(boundaries),
                listing: new DeviceTypeListing(),
            };
            for (const endpoint of pass.nodeScopeOf(nodeEndpoint)) {
                scope.listing.add(endpoint, this.#facts.deviceTypeIdsOf(endpoint));
            }
            this.#scopes.set(nodeEndpoint, scope);
        }
        return scope;
    }

    #revise(pass: DeviceTypeValidationPass<Endpoint>) {
        if (!this.#changed.size) {
            return;
        }
        const changed = [...this.#changed];
        this.#changed.clear();
        try {
            for (const endpoint of changed) {
                this.#reviseFor(endpoint, pass);
            }
        } catch (error) {
            // The changes not yet applied are lost, so no kept scope may be read again
            this.#scopes.clear();
            throw error;
        }
    }

    /**
     * Make what is kept of every scope match a walk of the tree as {@link endpoint} stands now: it and its descendants
     * leave the scope they were in and join the scope they are in now.
     */
    #reviseFor(endpoint: Endpoint, pass: DeviceTypeValidationPass<Endpoint>) {
        const own = this.#scopes.get(endpoint);
        if (own !== undefined) {
            if (pass.isNodeEndpoint(endpoint)) {
                own.reaching.delete(endpoint);
                if (pass.reachOf(endpoint) !== DeviceTypeValidationPass.Reach.None) {
                    own.reaching.add(endpoint);
                }
                own.listing.add(endpoint, this.#facts.deviceTypeIdsOf(endpoint));
                own.kept = undefined;
            } else {
                this.#scopes.delete(endpoint);
            }
        }

        for (const [nodeEndpoint, scope] of this.#scopes) {
            if (isAbove(nodeEndpoint, endpoint)) {
                this.#withdraw(scope, endpoint);
            }
        }

        const parent = endpoint.owner;
        if (parent === undefined || !this.#facts.isPresent(endpoint)) {
            return;
        }
        const nodeEndpoint = pass.nodeEndpointOf(parent);
        if (nodeEndpoint === undefined || !pass.isInScope(parent, nodeEndpoint)) {
            return;
        }
        const scope = this.#scopes.get(nodeEndpoint);
        if (scope !== undefined) {
            this.#enlist(scope, endpoint, pass);
        }
    }

    /**
     * Drop {@link endpoint} and its descendants from {@link scope}. A bounding node endpoint's descendants are in
     * another scope.
     */
    #withdraw(scope: KeptScope, endpoint: Endpoint) {
        const bounded = scope.boundaries.delete(endpoint);
        scope.listing.delete(endpoint);
        if (scope.reaching.delete(endpoint) || bounded) {
            scope.kept = undefined;
        }
        if (bounded) {
            return;
        }
        for (const part of this.#facts.partsOf(endpoint)) {
            this.#withdraw(scope, part);
        }
    }

    /**
     * Add {@link endpoint}, a present endpoint whose owner is in {@link scope}, and its descendants to {@link scope}, as
     * `scanReaching` walks them.
     */
    #enlist(scope: KeptScope, endpoint: Endpoint, pass: DeviceTypeValidationPass<Endpoint>) {
        if (pass.isNodeEndpoint(endpoint)) {
            scope.boundaries.add(endpoint);
            scope.kept = undefined;
            return;
        }
        scope.listing.add(endpoint, this.#facts.deviceTypeIdsOf(endpoint));
        if (pass.reachOf(endpoint) !== DeviceTypeValidationPass.Reach.None) {
            scope.reaching.add(endpoint);
            scope.kept = undefined;
        }
        for (const child of pass.childrenOf(endpoint)) {
            this.#enlist(scope, child, pass);
        }
    }

    #listingOfOwner(endpoint: Endpoint) {
        const { owner } = endpoint;
        return owner === undefined ? undefined : this.#listings.get(owner);
    }

    #listingOf(parent: Endpoint) {
        let listing = this.#listings.get(parent);
        if (listing === undefined) {
            listing = { byId: new Map(), present: new Map(), suspects: new Set() };
            this.#listings.set(parent, listing);
            for (const part of this.#facts.partsOf(parent)) {
                this.#list(parent, listing, part);
                listing.suspects.add(part);
            }
        }
        return listing;
    }

    /**
     * List {@link part} again as it stands now, or not at all once it is {@link removed}. Where the number of present
     * parts of a device type passes from one to two or back, every part of that device type becomes a suspect and is
     * read again by the kept scopes.
     */
    #relist(listing: Listing, part: Endpoint, removed = false) {
        const previous = new Map<number, number>();
        for (const id of this.#listed.get(part)?.ids ?? []) {
            previous.set(id, listing.present.get(id) ?? 0);
        }

        this.#unlist(listing, part);
        const parent = part.owner;
        if (!removed && parent !== undefined) {
            this.#list(parent, listing, part);
        }

        const after = this.#listed.get(part);
        for (const id of after?.ids ?? []) {
            if (!previous.has(id)) {
                previous.set(id, (listing.present.get(id) ?? 0) - (after?.present ? 1 : 0));
            }
        }

        for (const [id, count] of previous) {
            if (count > 1 === (listing.present.get(id) ?? 0) > 1) {
                continue;
            }
            for (const sibling of listing.byId.get(id) ?? []) {
                listing.suspects.add(sibling);
                for (const scope of this.#scopes.values()) {
                    scope.reaching.invalidate(sibling);
                }
            }
        }
    }

    #list(parent: Endpoint, listing: Listing, part: Endpoint) {
        if (!parent.parts.has(part)) {
            return;
        }
        const presence = this.#facts.presenceOf(part);
        if (presence === Presence.Detached || presence === Presence.Crashed) {
            return;
        }

        const listed = {
            ids: [...this.#facts.deviceTypeIdsOf(part)],
            present: presence === Presence.Constructing || presence === Presence.Active,
        };
        this.#listed.set(part, listed);
        for (const id of listed.ids) {
            let parts = listing.byId.get(id);
            if (parts === undefined) {
                parts = new Set();
                listing.byId.set(id, parts);
            }
            if (!parts.has(part)) {
                parts.add(part);
                if (listed.present) {
                    listing.present.set(id, (listing.present.get(id) ?? 0) + 1);
                }
            }
        }
    }

    #unlist(listing: Listing, part: Endpoint) {
        const listed = this.#listed.get(part);
        if (listed === undefined) {
            return;
        }
        this.#listed.delete(part);

        for (const id of listed.ids) {
            const parts = listing.byId.get(id);
            if (parts === undefined || !parts.delete(part)) {
                continue;
            }
            if (listed.present) {
                const count = (listing.present.get(id) ?? 0) - 1;
                if (count > 0) {
                    listing.present.set(id, count);
                } else {
                    listing.present.delete(id);
                }
            }
            if (parts.size === 0) {
                listing.byId.delete(id);
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

interface KeptScope {
    reaching: ReachingEndpoints<Endpoint>;

    /**
     * The present node endpoints below the scope's node endpoint whose subtrees the scope leaves out.
     */
    boundaries: Set<Endpoint>;

    /**
     * Every endpoint of the scope, the node endpoint included, by device type.
     */
    listing: DeviceTypeListing;

    /**
     * What {@link NodeScopeIndex.keptOf} answers until the scope changes.
     */
    kept?: Endpoint[];
}

/**
 * Endpoints by the device type IDs each listed when it was added.
 */
class DeviceTypeListing {
    readonly byId = new Map<number, Set<Endpoint>>();
    readonly #ids = new Map<Endpoint, readonly number[]>();

    add(endpoint: Endpoint, ids: Iterable<number>) {
        this.delete(endpoint);
        const listed = [...ids];
        this.#ids.set(endpoint, listed);
        for (const id of listed) {
            let endpoints = this.byId.get(id);
            if (endpoints === undefined) {
                endpoints = new Set();
                this.byId.set(id, endpoints);
            }
            endpoints.add(endpoint);
        }
    }

    delete(endpoint: Endpoint) {
        const ids = this.#ids.get(endpoint);
        if (ids === undefined) {
            return;
        }
        this.#ids.delete(endpoint);
        for (const id of ids) {
            const endpoints = this.byId.get(id);
            endpoints?.delete(endpoint);
            if (endpoints?.size === 0) {
                this.byId.delete(id);
            }
        }
    }
}

/**
 * The parts of one endpoint by device type, with the number of present parts per device type.
 */
interface Listing {
    byId: Map<number, Set<Endpoint>>;
    present: Map<number, number>;
    suspects: Set<Endpoint>;
}

interface Listed {
    ids: number[];
    present: boolean;
}

function isAbove(ancestor: Endpoint, endpoint: Endpoint) {
    for (let current = endpoint.owner; current !== undefined; current = current.owner) {
        if (current === ancestor) {
            return true;
        }
    }
    return false;
}
