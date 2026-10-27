/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Datasource } from "#behavior/state/managed/Datasource.js";
import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { DatasourceCache } from "#storage/client/DatasourceCache.js";
import { createPromise } from "@matter/general";
import { Val } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";

export function createCache(options?: {
    buffer?: ClientCacheBuffer;
    localWriter?: {
        persistInTransaction: (...args: any[]) => Promise<void>;
        persist: (...args: any[]) => Promise<void>;
    };
}) {
    return new DatasourceCache({
        writer: (() => {}) as any,
        nodeId: "test-peer",
        endpointNumber: EndpointNumber(1),
        behaviorId: "test",
        localWriter: options?.localWriter as any,
        buffer: options?.buffer,
    });
}

export function attrs(entries: Record<string, unknown>): Val.StructMap {
    return new Map(Object.entries(entries));
}

/** A localWriter that records persist calls without touching the transaction's type-safe set() */
export function trackingWriter() {
    const persisted: Val.Struct[] = [];
    return {
        persisted,
        persistInTransaction: async (_tx: any, _ep: any, _bid: any, vals: Val.Struct) => {
            persisted.push(vals);
        },
        persist: async (_ep: any, _bid: any, vals: Val.Struct) => {
            persisted.push(vals);
        },
        erase: async () => {},
    };
}

/** A consumer that applies values to {@link values} and records each announcement when it runs. */
export function recordingConsumer() {
    const values: Val.Struct = {};
    const integrated = new Array<Val.Struct>();
    const announced = new Array<Val.Struct>();
    const consumer = {
        readValues: () => ({}),
        snapshot: () => ({ ...values }),
        releaseValues: () => ({ ...values }),
        integrate: (changes: Val.StructMap) => {
            const change = Object.fromEntries(changes);
            Object.assign(values, change);
            integrated.push(change);
            return async () => {
                announced.push(change);
            };
        },
    } satisfies Datasource.ExternallyMutableStore.Consumer;
    return { values, integrated, announced, consumer };
}

/**
 * A local writer whose every persist waits until the test lets it finish, then patches {@link stored} like
 * storage does.
 */
export function gatedWriter() {
    const stored: Val.Struct = {};
    const pending = new Array<{ values: Val.Struct; finish: () => void }>();
    return {
        stored,
        pending,
        persistInTransaction: async () => {},
        persist: async (_ep: unknown, _bid: unknown, values: Val.Struct) => {
            const { promise, resolver } = createPromise<void>();
            pending.push({ values, finish: resolver });
            await promise;
            Object.assign(stored, values);
        },

        /**
         * Finish {@link count} persists.  Each round waits for the next persist to start, then finishes the newest
         * unfinished one, so an older persist finishes after a newer one whenever the cache lets both run at once.
         */
        async finishNewestFirst(count: number) {
            const finished = new Set<number>();
            while (finished.size < count) {
                for (let i = 0; i < 10 && pending.length === finished.size; i++) {
                    await MockTime.yield();
                }
                const newest = pending.length - 1;
                const index = finished.has(newest) ? pending.findIndex((_, i) => !finished.has(i)) : newest;
                pending[index].finish();
                finished.add(index);
            }
        },
    };
}
