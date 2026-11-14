/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ClusterBehavior } from "#behavior/cluster/ClusterBehavior.js";
import type { Endpoint } from "#endpoint/Endpoint.js";
import type { ClientNode } from "#node/ClientNode.js";
import { ImplementationError } from "@matter/general";
import { DuplicateItemKindError, UnknownItemKindError } from "./errors.js";
import type { ManagedItem } from "./types.js";

/** Observed device limit and current usage for a kind on one node. */
export interface CapacityInfo {
    limit: number;
    used: number;
}

/** A cached attribute whose reports can show drift for an item. */
export interface ItemWatch {
    /** The endpoint that reports it: the root, or the one the item names. */
    endpoint: Endpoint;

    /** The client behavior holding the attribute, e.g. `AccessControlClient`. */
    behavior: ClusterBehavior.Type;

    /** The attribute's name in that behavior's state, e.g. `"acl"`. */
    attribute: string;
}

export interface ItemKind<I = unknown> {
    readonly kind: string;

    readonly priority: number;

    apply(node: ClientNode, item: ManagedItem<I>): Promise<void>;
    read?(node: ClientNode): Promise<ManagedItem<I>[]>;
    diff?(intent: I, current: I): boolean;

    /**
     * Report, from a live read, whether the device currently satisfies `item`: `true` means no drift, `false`
     * means drifted. The engine calls this on a verify pass for each committed item; the item's mode and the pass
     * decide what a drift leads to. Kinds own the device read and match; `read`/`diff` remain optional helpers.
     *
     * A throw means "not read": the engine decides nothing about drift for the item, and an explicit
     * `reconcile({ verify: true })` rejects with the error once its pass is done.
     */
    verify?(node: ClientNode, item: ManagedItem<I>): Promise<boolean>;

    remove?(node: ClientNode, item: ManagedItem<I>): Promise<void>;
    recoverable?(code: number): boolean;
    capacity?(node: ClientNode): Promise<CapacityInfo>;

    /**
     * Exclude this kind from pre-flight task admission. Set when `capacity` counts a coarser resource than
     * this kind's per-item key (e.g. per-endpoint membership sharing a per-group limit), so admitting it
     * would double-count a slot another kind already gates. `capacity` still serves the reconciler.
     */
    readonly excludeFromAdmission?: boolean;

    /**
     * Report whether another live desired-state intent still depends on the `(kind, key)` entry, so a
     * shared entry is not deleted while referenced. Unimplemented ⇒ no dependents ⇒ always removable.
     */
    isReferenced?(node: ClientNode, key: string): boolean;

    /**
     * Cached attributes whose reports can show drift for `item`. Absent: the kind is verify-only. Declared
     * together with `satisfiedBy` and `verify`, or not at all. Returns nothing when the endpoint or the cluster is
     * absent on the node.
     */
    watches?(node: ClientNode, item: ManagedItem<I>): ItemWatch[];

    /**
     * Whether the subscription cache satisfies `item`, counting only entries of the node's fabric. A trigger
     * filter: an unsatisfied answer leads to a live `verify`, which alone decides, so a kind declaring this must
     * declare `verify` too.
     */
    satisfiedBy?(node: ClientNode, item: ManagedItem<I>): boolean;
}

export class ItemKindRegistry {
    readonly #kinds = new Map<string, ItemKind>();

    register(kind: ItemKind): void {
        if (kind.watches !== undefined && kind.satisfiedBy === undefined) {
            throw new ImplementationError(`Item kind "${kind.kind}" declares watches but not satisfiedBy`);
        }
        if (kind.satisfiedBy !== undefined && kind.watches === undefined) {
            throw new ImplementationError(`Item kind "${kind.kind}" declares satisfiedBy but not watches`);
        }
        if (kind.satisfiedBy !== undefined && kind.verify === undefined) {
            throw new ImplementationError(
                `Item kind "${kind.kind}" declares watches and satisfiedBy but not verify, so no drift it reports could be read`,
            );
        }
        if (this.#kinds.has(kind.kind)) {
            throw new DuplicateItemKindError(`Item kind "${kind.kind}" is already registered`);
        }
        this.#kinds.set(kind.kind, kind);
    }

    get(kind: string): ItemKind | undefined {
        return this.#kinds.get(kind);
    }

    require(kind: string): ItemKind {
        const found = this.#kinds.get(kind);
        if (found === undefined) {
            throw new UnknownItemKindError(`No item kind registered for "${kind}"`);
        }
        return found;
    }

    all(): ItemKind[] {
        return [...this.#kinds.values()].sort((a, b) => a.priority - b.priority);
    }
}
