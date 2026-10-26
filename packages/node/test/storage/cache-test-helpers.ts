/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Datasource } from "#behavior/state/managed/Datasource.js";
import { ClientCacheBuffer } from "#storage/client/ClientCacheBuffer.js";
import { DatasourceCache } from "#storage/client/DatasourceCache.js";
import { createPromise, Instant, MemoryStorageDriver, StorageDriver } from "@matter/general";
import { Val } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";

/**
 * A cache on endpoint 1.  {@link localWriter} stands in for the endpoint store the cache persists into.  A cache with a
 * {@link localWriter} and no {@link buffer} persists through a buffer that flushes each settlement at once.
 */
export function createCache(options?: {
    buffer?: ClientCacheBuffer;
    localWriter?: {
        persistInTransaction: (tx: StorageDriver.Transaction, ...args: any[]) => Promise<void>;
        erase?: () => Promise<void>;
    };
}) {
    const localWriter = options?.localWriter;
    const buffer =
        options?.buffer ?? (localWriter ? new ClientCacheBuffer(MemoryStorageDriver.create(), Instant) : undefined);
    return new DatasourceCache({
        writer: (() => {}) as any,
        nodeId: "test-peer",
        endpointNumber: EndpointNumber(1),
        behaviorId: "test",
        persist: localWriter
            ? (tx, values) => localWriter.persistInTransaction(tx, EndpointNumber(1), "test", values)
            : undefined,
        eraseStored: localWriter?.erase,
        buffer,
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
    };
}

/** A consumer that applies values to {@link values} and records each announcement when it runs. */
export function recordingConsumer() {
    const values: Val.Struct = {};
    const integrated = new Array<Val.Struct>();
    const announced = new Array<Val.Struct>();
    const consumer = {
        readValues: (keys: Set<string>) => {
            const read: Val.Struct = {};
            for (const key of keys) {
                if (key in values) {
                    read[key] = values[key];
                }
            }
            return read;
        },
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
        persistInTransaction: async (_tx: unknown, _ep: unknown, _bid: unknown, values: Val.Struct) => {
            const { promise, resolver } = createPromise<void>();
            pending.push({ values, finish: resolver });
            await promise;
            Object.assign(stored, values);
        },

        /**
         * Let one persist after another finish until {@link done} settles.
         */
        async finishUntil(done: Promise<unknown>) {
            let settled = false;
            const settling = done.finally(() => (settled = true));
            let finished = 0;
            while (!settled) {
                await MockTime.yield();
                if (finished < pending.length) {
                    pending[finished++].finish();
                }
            }
            await settling;
        },

        /**
         * Resolves once {@link count} persists have started.
         */
        async started(count: number) {
            while (pending.length < count) {
                await MockTime.yield();
            }
        },
    };
}
