/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Abort, Duration, Logger, Mutex, StorageDriver } from "@matter/general";
import { StoreClosedError } from "../StoreLifecycle.js";
import type { DatasourceCache } from "./DatasourceCache.js";
import { FailureKinds } from "./FailureKinds.js";

const logger = Logger.get("ClientCacheBuffer");

/**
 * The only path on which client caches persist the values the peer reports, and the only fence between those writes
 * and a clear of the storage they write to.
 *
 * The buffer serves one storage driver.  Every write and every clear of cached storage runs as a job on its queue, one
 * job after another, and a job opens at most one transaction.  The modes differ only in when a flush is queued:
 *
 * | interval  | a settlement                                  | {@link initiateFlush}, timer, {@link close} |
 * |-----------|-----------------------------------------------|---------------------------------------------|
 * | `Instant` | queues a flush of its cache and awaits it     | queue a flush of all dirty caches           |
 * | longer    | marks its cache dirty                         | queue a flush of all dirty caches           |
 *
 * {@link persistNow} queues a flush of one cache in both modes.  {@link clear} queues a clear, which runs after every
 * job queued before it.  A cache that is discarded before its clear is queued writes nothing in a later job.
 *
 * A job reports its failure to the callers that await it and logs it otherwise.  A cache that fails stays dirty and is
 * flushed again by the next job that covers it.  A discarded cache never enters the dirty set.  Once the buffer closed
 * it queues no flush: a persist asked for afterwards comes from a teardown race and is dropped.
 *
 * All peers of a server node share the one queue, so their persists and the clears of an erased peer run one after
 * another.  We accept that slow storage delays the reports of every peer, because a clear must not run between the
 * writes of a flush that started before it.
 */
export class ClientCacheBuffer {
    #dirty = new Set<DatasourceCache>();
    #abort = new Abort();
    #queue = new Mutex(this);
    #closed = false;
    #storageDriver: StorageDriver;
    #flushInterval: Duration;
    #timerDone?: Promise<void>;
    #warnedFailureKinds = new FailureKinds();

    /**
     * A {@link flushInterval} of `Instant` flushes each settlement at once; a longer one starts a timer that flushes
     * the dirty caches.
     */
    constructor(storageDriver: StorageDriver, flushInterval: Duration) {
        this.#storageDriver = storageDriver;
        this.#flushInterval = flushInterval;
        if (flushInterval) {
            this.#timerDone = this.#timerLoop();
        }
    }

    /**
     * Persist the dirty values of {@link cache}: at once with an `Instant` interval, else with the next flush.
     *
     * Resolves with the failure to persist them at once, if any.
     */
    async persist(cache: DatasourceCache): Promise<unknown> {
        if (!this.#flushInterval) {
            return this.persistNow(cache);
        }
        if (this.#isClosed()) {
            return;
        }
        this.#markDirty(cache);
    }

    /**
     * Persist the dirty values of {@link cache} in a job of its own, after the jobs queued before.  Resolves with the
     * failure to persist them, if any.  Other dirty caches wait for their own job.
     */
    async persistNow(cache: DatasourceCache): Promise<unknown> {
        if (this.#isClosed()) {
            return;
        }
        this.#markDirty(cache);
        return (await this.#queue.produce(() => this.#flush([cache]))).get(cache);
    }

    /**
     * Queue a flush of all dirty caches.  Logs its failures like {@link flush}.  Safe to call from sync contexts.
     */
    initiateFlush(): void {
        if (this.#isClosed()) {
            return;
        }
        this.#queue.run(async () => this.#logFailures(await this.#flush()));
    }

    /**
     * Flush all dirty caches.  Resolves once the flush ended; a cache that fails is logged and stays dirty.
     *
     * A lasting storage failure fails every flush, and each resubscribe of a peer queues one.  So only the first failure
     * of each kind is a warning; repeats log at debug level until a flush ends without failure.
     */
    async flush(): Promise<void> {
        this.#logFailures(await this.#enqueueFlush());
    }

    /**
     * Run {@link clear}, which clears cached storage, after the jobs queued before.  Rejects with its failure.  Discard
     * the caches of that storage before, so a flush queued later writes nothing to it.
     */
    async clear(clear: () => Promise<void>): Promise<void> {
        return this.#queue.produce(clear);
    }

    /**
     * Stop the timer and flush the remaining dirty caches.  Queues no flush afterwards; a {@link clear} still runs
     * after the final flush.
     */
    async close(): Promise<void> {
        this.#abort();
        await this.#timerDone;

        const finalFlush = this.#enqueueFlush();
        this.#closed = true;

        for (const failure of new Set((await finalFlush)?.values())) {
            logger.warn("Final cache flush failed:", failure);
        }
    }

    /**
     * Queue a flush of the dirty caches among {@link caches}, or of all dirty caches.  Resolves with the failure of
     * each cache that did not persist, or undefined once the buffer closed.
     */
    #enqueueFlush(caches?: DatasourceCache[]): Promise<Map<DatasourceCache, unknown> | undefined> {
        if (this.#isClosed()) {
            return Promise.resolve(undefined);
        }
        return this.#queue.produce(() => this.#flush(caches));
    }

    #isClosed() {
        if (this.#closed) {
            logger.debug("Cache values not persisted because the cache buffer closed");
        }
        return this.#closed;
    }

    /**
     * Flush the dirty caches among {@link caches}, or all dirty caches, in one transaction.  A cache stays dirty if it
     * still has dirty values afterwards, unless its store ended.
     */
    async #flush(caches?: DatasourceCache[]): Promise<Map<DatasourceCache, unknown>> {
        const failures = new Map<DatasourceCache, unknown>();
        const snapshot = caches === undefined ? [...this.#dirty] : caches.filter(cache => this.#dirty.has(cache));
        for (const cache of snapshot) {
            this.#dirty.delete(cache);
        }

        if (!snapshot.length) {
            return failures;
        }

        let tx: StorageDriver.Transaction;
        try {
            tx = await this.#storageDriver.begin();
        } catch (e) {
            for (const cache of snapshot) {
                this.#fail(cache, e, failures);
            }
            return failures;
        }

        try {
            await this.#flushInto(tx, snapshot, failures);
        } finally {
            try {
                await tx[Symbol.asyncDispose]();
            } catch (e) {
                logger.warn("Cannot roll back a failed cache flush:", e);
            }
        }
        return failures;
    }

    async #flushInto(
        tx: StorageDriver.Transaction,
        snapshot: DatasourceCache[],
        failures: Map<DatasourceCache, unknown>,
    ) {
        // Flush each cache individually so one broken cache doesn't crash the batch
        const flushedKeys = new Array<{ cache: DatasourceCache; keys: Set<string> }>();

        for (const cache of snapshot) {
            try {
                const keys = await cache.flush(tx);
                if (keys) {
                    flushedKeys.push({ cache, keys });
                } else {
                    this.#markDirty(cache);
                }
            } catch (e) {
                if (e instanceof StoreClosedError) {
                    logger.debug("Dropping a cache whose store ended from the flush buffer:", e);
                } else {
                    this.#fail(cache, e, failures);
                }
            }
        }

        if (!flushedKeys.length) {
            return;
        }

        try {
            await tx.commit();
        } catch (e) {
            for (const { cache, keys } of flushedKeys) {
                cache.restoreDirtyKeys(keys);
                this.#fail(cache, e, failures);
            }
            return;
        }

        logger.debug("Flushed", flushedKeys.length, "dirty caches");
    }

    #markDirty(cache: DatasourceCache) {
        if (cache.isDirty) {
            this.#dirty.add(cache);
        }
    }

    #fail(cache: DatasourceCache, failure: unknown, failures: Map<DatasourceCache, unknown>) {
        this.#markDirty(cache);
        failures.set(cache, failure);
    }

    #logFailures(failures?: Map<DatasourceCache, unknown>) {
        if (failures === undefined) {
            return;
        }
        if (!failures.size) {
            this.#warnedFailureKinds.reset();
            return;
        }
        for (const failure of new Set(failures.values())) {
            if (this.#warnedFailureKinds.add(failure)) {
                logger.warn("Cache flush failed, will retry; repeats log at debug level:", failure);
            } else {
                logger.debug("Cache flush failed again, will retry:", failure);
            }
        }
    }

    async #timerLoop() {
        while (!this.#abort.aborted) {
            await this.#abort.sleep("client-cache-flush", this.#flushInterval);
            if (this.#abort.aborted) {
                break;
            }
            await this.flush();
        }
    }
}
