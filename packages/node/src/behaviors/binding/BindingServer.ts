/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Logger, Observable } from "@matter/general";
import { Binding } from "@matter/types/clusters/binding";
import { BindingBehavior } from "./BindingBehavior.js";
import { BindingManager, type BindingResolution } from "./BindingManager.js";

const logger = Logger.get("BindingServer");

/**
 * This is the default server implementation of {@link BindingBehavior}.
 *
 * It exposes {@link BindingServer.binding} observables so application code can react when a binding is resolved or
 * removed, and provides entry points for {@link BindingManager} to fire those observables without unsafe casts.
 */
export class BindingServer extends BindingBehavior {
    declare internal: BindingServer.Internal;

    override initialize() {
        const manager = this.env.get(BindingManager);
        for (const entry of this.state.binding) {
            manager.register(this, this.endpoint, entry);
        }
        this.reactTo(this.events.binding$Changed, (newList: Binding.Target[], oldList: Binding.Target[]) => {
            const oldKeys = new Map(oldList.map(e => [this.#cacheKey(e), e]));
            const newKeys = new Map(newList.map(e => [this.#cacheKey(e), e]));
            for (const [k, e] of newKeys) {
                if (!oldKeys.has(k)) manager.register(this, this.endpoint, e);
            }
            for (const [k, e] of oldKeys) {
                if (!newKeys.has(k)) manager.unregister(this, this.endpoint, e);
            }
        });
    }

    /** Observables consumed by application code to react to binding lifecycle events. */
    get binding(): { established: Observable<[BindingResolution]>; removed: Observable<[BindingResolution]> } {
        return this.internal;
    }

    /**
     * Called by {@link BindingManager} when a binding resolution completes.
     *
     * Warns when no subscriber has registered and the endpoint declares client clusters, signalling likely missing
     * application wiring.
     */
    emitEstablished(r: BindingResolution): void {
        const { cache, established } = this.internal;
        cache.set(this.#cacheKey(r.entry), r);
        const hasSubscribers = established.isObserved;
        established.emit(r);
        if (!hasSubscribers && Object.keys(this.endpoint.type.clientClusters).length > 0) {
            logger.warn(
                "Binding established on endpoint with declared client clusters but no subscriber attached",
                Diagnostic.dict({ endpoint: this.endpoint.number, kind: r.kind }),
            );
        }
    }

    /** Called by {@link BindingManager} when a binding is removed (attribute write or unregister). */
    emitRemoved(r: BindingResolution): void {
        const { cache, removed } = this.internal;
        cache.delete(this.#cacheKey(r.entry));
        removed.emit(r);
    }

    override async [Symbol.asyncDispose]() {
        const { cache, removed } = this.internal;
        const snapshot = [...cache.values()];
        cache.clear();
        for (const resolution of snapshot) {
            removed.emit(resolution);
        }
        await super[Symbol.asyncDispose]?.();
    }

    #cacheKey(entry: Binding.Target): string {
        return [entry.fabricIndex, entry.node ?? "", entry.group ?? "", entry.endpoint ?? "", entry.cluster ?? ""].join(
            "/",
        );
    }
}

export namespace BindingServer {
    export class Internal {
        readonly established = Observable<[BindingResolution]>();
        readonly removed = Observable<[BindingResolution]>();
        readonly cache = new Map<string, BindingResolution>();
    }
}
