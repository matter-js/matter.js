/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NetworkServer } from "#behavior/system/network/NetworkServer.js";
import type { ClientNode } from "#node/ClientNode.js";
import { Abort, Duration, Logger, Mutex, StorageDriver, StorageManager } from "@matter/general";
import type { ClientNodeStore } from "./ClientNodeStore.js";
import type { DatasourceCache } from "./DatasourceCache.js";

const logger = Logger.get("ClientCacheBuffer");

/**
 * Buffers client cache writes and flushes them periodically in a single storage transaction.
 *
 * Instead of persisting every attribute change immediately, dirty caches are tracked and flushed together.  This
 * allows WAL-based storage drivers to coalesce all dirty data into a single log entry.
 */
export class ClientCacheBuffer {
    #dirty = new Set<DatasourceCache>();
    #abort = new Abort();
    #mutex = new Mutex(this);
    #storageDriver: StorageDriver;
    #flushInterval: Duration;
    #timerDone?: Promise<void>;

    constructor(storageDriver: StorageDriver, flushInterval: Duration) {
        this.#storageDriver = storageDriver;
        this.#flushInterval = flushInterval;
    }

    /**
     * If buffering is configured on the parent ServerNode, set up the buffer on the store.  The first call creates
     * the buffer and starts the timer; subsequent calls reuse it.
     */
    static configure(node: ClientNode, store: ClientNodeStore) {
        const flushInterval = node.owner.stateOf(NetworkServer).clientCacheFlushInterval;
        if (flushInterval === undefined) {
            return;
        }

        const parentEnv = node.owner.env;
        if (parentEnv.has(ClientCacheBuffer)) {
            store.buffer = parentEnv.get(ClientCacheBuffer);
            return;
        }

        const buffer = new ClientCacheBuffer(parentEnv.get(StorageManager).driver, flushInterval);
        parentEnv.set(ClientCacheBuffer, buffer);
        buffer.#start();
        store.buffer = buffer;
    }

    /**
     * Mark a cache as having dirty data that needs flushing.
     */
    markDirty(cache: DatasourceCache): void {
        this.#dirty.add(cache);
    }

    /**
     * Remove a cache from the dirty set (e.g. on erase or reclaim).
     */
    removeDirty(cache: DatasourceCache): void {
        this.#dirty.delete(cache);
    }

    /**
     * Schedule a flush.  The flush runs serialized through the mutex; the promise is tracked internally.  Safe to
     * call from sync contexts.
     */
    initiateFlush(): void {
        this.#mutex.run(() => this.#doFlush());
    }

    /**
     * Flush all dirty caches to storage in a single transaction.  Awaits completion.
     */
    async flush(): Promise<void> {
        this.initiateFlush();
        await this.#mutex;
    }

    /**
     * Stop the timer and flush any remaining dirty data.
     */
    async close(): Promise<void> {
        this.#abort();
        await this.#timerDone;

        // Final flush then drain
        this.initiateFlush();
        await this.#mutex.close();
    }

    async #doFlush(): Promise<void> {
        const snapshot = [...this.#dirty];
        this.#dirty.clear();

        if (!snapshot.length) {
            return;
        }

        const tx = await this.#storageDriver.begin();

        try {
            for (const cache of snapshot) {
                await cache.flush(tx);
            }
            await tx.commit();
        } catch (e) {
            tx[Symbol.dispose]();

            // Restore caches that failed to flush so they are retried
            for (const cache of snapshot) {
                this.#dirty.add(cache);
            }

            throw e;
        }

        logger.debug("Flushed", snapshot.length, "dirty caches");
    }

    #start() {
        this.#timerDone = this.#timerLoop();
    }

    async #timerLoop() {
        while (!this.#abort.aborted) {
            await this.#abort.sleep("client-cache-flush", this.#flushInterval);
            if (this.#abort.aborted) {
                break;
            }

            // Run the actual flush through the mutex so it serializes with explicit flush calls
            await this.#mutex.produce(() => this.#doFlush());
        }
    }
}
