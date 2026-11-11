/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Datasource } from "#behavior/state/managed/Datasource.js";
import { InternalError, Logger, MaybePromise, StorageDriver, Transaction } from "@matter/general";
import type { DataModelPath } from "@matter/model";
import { Val } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";
import type { ClientCacheBuffer } from "./ClientCacheBuffer.js";
import type { LocalWriter } from "./LocalWriter.js";
import { RemoteWriteParticipant } from "./RemoteWriteParticipant.js";
import type { RemoteWriter } from "./RemoteWriter.js";

const logger = Logger.get("DatasourceCache");

const nothingToRelease = async () => {};

interface Announcement {
    open: boolean;
    announce: () => MaybePromise<void>;
}

/**
 * The default implementation of {@link Datasource.ExternallyMutableStore}.
 *
 * This implements storage for attribute values for a single cluster loaded from peers.
 *
 * The peer is the only writer of these values.  Its reports and its answers to our writes are settlements that enter
 * through one path, in one sequence: {@link externalSet} and {@link settleAccepted}.
 */
export class DatasourceCache implements Datasource.ExternallyMutableStore, RemoteWriteParticipant.Receiver {
    #writer: RemoteWriter;
    #nodeId: string;
    #endpointNumber: EndpointNumber;
    #behaviorId: string;
    #localWriter?: LocalWriter;
    #buffer?: ClientCacheBuffer;
    #version: number;
    #dirtyKeys = new Set<string>();

    /**
     * The tail of the unbuffered persists.  Storage takes patches, so they run one after another in arrival order:
     * the last patch stored for a key must be its latest settlement.  It never rejects; each persist's own caller
     * receives its failure.
     */
    #persisted: Promise<void> = Promise.resolve();

    /**
     * Counts settlements as they arrive: each report, and each answer that accepts a write.
     */
    #epoch = 0;

    /**
     * The arrival {@link #epoch} of the peer's latest word on each attribute.  While the cache is neither erased nor
     * reclaimed, a stamped settlement is in memory: its values apply when it arrives, before they persist, and stay even
     * when persisting them fails.  Memory always
     * follows the device; only the stored copy lags until the next settlement.
     */
    #settledAt = new Map<string, number>();

    /**
     * Change announcements in the order the changes were settled.  An entry stays closed until its values are
     * persisted or handed to the buffer and, for an accepted write, until the transaction that settled it ends; every
     * entry behind it waits.
     */
    #announcements = new Array<Announcement>();
    #draining = false;

    #erased = false;
    #reclaimed = false;
    #consumer?: Datasource.ExternallyMutableStore.Consumer;

    initialValues?: Val.Struct;

    constructor(options: DatasourceCache.Options) {
        this.#writer = options.writer;
        this.#nodeId = options.nodeId;
        this.#endpointNumber = options.endpointNumber;
        this.#behaviorId = options.behaviorId;
        this.#localWriter = options.localWriter;
        this.#buffer = options.buffer;
        this.initialValues = options.initialValues;

        const version = options.initialValues?.[DatasourceCache.VERSION_KEY] as number;
        this.#version = typeof version === "number" ? version : Datasource.UNKNOWN_VERSION;
    }

    get consumer() {
        return this.#consumer;
    }

    set consumer(consumer: Datasource.ExternallyMutableStore.Consumer | undefined) {
        this.#consumer = consumer;
        if (consumer !== undefined) {
            this.#reclaimed = false;

            // Consumer owns the values while attached; drop our seed copy so we don't shadow it.
            this.initialValues = undefined;
        }
    }

    /**
     * Current values, preferring the live consumer over the seed snapshot, so cluster structure can rebuild from
     * up-to-date data while a behavior is active.
     */
    get currentValues(): Val.Struct | undefined {
        return this.#consumer && !this.#reclaimed ? this.#consumer.snapshot() : this.initialValues;
    }

    prepare(values: Val.Struct, path: DataModelPath): Datasource.ExternallyMutableStore.Send {
        const write = this.#writer.prepare({
            number: this.#endpointNumber,
            behaviorId: this.#behaviorId,
            values,
            cached: this.currentValues,
            path,
        });
        return transaction => this.#propose(transaction, write);
    }

    assertWritable(path: DataModelPath) {
        this.#writer.assertWritable(path);
    }

    #propose(transaction: Transaction, write: RemoteWriter.PreparedWrite) {
        let participant = transaction.getParticipant(this.#writer);
        if (participant === undefined) {
            participant = new RemoteWriteParticipant(this.#writer, this.#nodeId);
            transaction.addParticipants(participant);
        }
        (participant as RemoteWriteParticipant).set(write, this, this.#epoch);
    }

    async settleAccepted(
        values: Val.Struct,
        epoch: number,
        cacheMerges?: RemoteWriter.PreparedWrite["cacheMerges"],
    ): Promise<RemoteWriteParticipant.Settled> {
        const accepted = new Map<string, Val>();
        for (const id in values) {
            if ((this.#settledAt.get(id) ?? -1) > epoch) {
                continue;
            }
            const merge = cacheMerges?.get(id);
            accepted.set(id, merge === undefined ? values[id] : merge(this.currentValues?.[id]));
        }
        if (!accepted.size) {
            return { release: nothingToRelease, persistFailure: undefined };
        }

        const { announcement, persistFailure } = await this.#settle(accepted);
        if (announcement === undefined) {
            return { release: nothingToRelease, persistFailure };
        }
        return { release: () => this.#open(announcement), persistFailure };
    }

    async externalSet(values: Val.StructMap): Promise<Datasource.ExternallyMutableStore.Applied> {
        const { announcement, persistFailure } = await this.#settle(values);
        if (announcement !== undefined) {
            await this.#open(announcement);
        }
        return { persistFailure };
    }

    /**
     * Settle values the peer reported or accepted.  Before its first await this stamps them with their arrival epoch,
     * applies them in memory and queues their announcement, closed; then it persists them in arrival order.  Memory
     * keeps the values when persisting fails.  A report that confirms a value we already hold is stamped too: it leaves
     * no other trace, and it still outranks a write in flight.
     *
     * Resolves once the values are persisted, or handed to the buffer, with the closed announcement of the changes, if
     * any, and the persist failure, if any.  The caller opens the announcement.
     */
    async #settle(values: Val.StructMap): Promise<{ announcement?: Announcement; persistFailure?: unknown }> {
        const epoch = ++this.#epoch;
        for (const key of values.keys()) {
            const id = String(key);
            if (!id.startsWith("__")) {
                this.#settledAt.set(id, epoch);
            }
        }

        if (this.#erased || this.#reclaimed) {
            return {};
        }

        const versionVal = values.get(DatasourceCache.VERSION_KEY);
        if (typeof versionVal === "number") {
            this.#version = versionVal;
        }

        const announcement = this.#apply(values);

        if (this.#buffer) {
            for (const key of values.keys()) {
                this.#dirtyKeys.add(String(key));
            }
            this.#buffer.markDirty(this);
            return { announcement };
        }

        const valuesStruct = Object.fromEntries(values) as Val.Struct;
        try {
            await this.#persistInOrder(localWriter =>
                localWriter.persist(this.#endpointNumber, this.#behaviorId, valuesStruct),
            );
        } catch (error) {
            return { announcement, persistFailure: error };
        }
        return { announcement };
    }

    /**
     * Apply settled values to the consumer, or to the seed while none is attached, and queue the announcement of the
     * changes, closed.
     */
    #apply(values: Val.StructMap) {
        if (!this.#consumer) {
            this.#seed(values);
            return;
        }

        const announce = this.#consumer.integrate(values);
        if (announce === undefined) {
            return;
        }

        const announcement = { open: false, announce };
        this.#announcements.push(announcement);
        return announcement;
    }

    async #open(announcement: Announcement) {
        announcement.open = true;
        await this.#drain();
    }

    /**
     * Emit the open announcements at the head of the queue, one drain at a time.  A caller that finds a drain running
     * returns, and that drain announces what opens meanwhile.  A caller that finds a drain running does not wait for its
     * own entry: the observer holding the queue may be the one awaiting this caller.  For the same reason, a post-commit observer of a writing
     * transaction must not await a change of the same cluster that sits behind the transaction's own closed entry; it
     * opens only when that transaction ends.
     *
     * An announcement logs its own failures; the catch here only keeps a failure from stranding the entries behind it.
     */
    async #drain() {
        if (this.#draining) {
            return;
        }

        this.#draining = true;
        try {
            while (this.#announcements[0]?.open) {
                try {
                    await this.#announcements.shift()!.announce();
                } catch (e) {
                    logger.warn(`Error announcing changes of ${this.#nodeId} endpoint ${this.#endpointNumber}:`, e);
                }
            }
        } finally {
            this.#draining = false;
        }
    }

    /**
     * Run {@link write} after every persist requested before it, unless this cache is erased by then.
     */
    async #persistInOrder(write: (localWriter: LocalWriter) => Promise<void>) {
        const localWriter = this.#localWriter;
        if (!localWriter) {
            return;
        }

        const persisting = this.#persisted.then(() => {
            if (!this.#erased) {
                return write(localWriter);
            }
        });

        // Only orders later persists; the caller receives this one's failure
        this.#persisted = persisting.then(undefined, () => {});
        await persisting;
    }

    #seed(values: Val.StructMap) {
        if (!this.initialValues) {
            this.initialValues = {};
        }
        Object.assign(this.initialValues, Object.fromEntries(values));
    }

    /**
     * Reclaim {@link initialValues} from the active datasource so the cache can be detached.  Blocks
     * {@link externalSet} until a new {@link consumer} is assigned, preventing writes to the released datasource.
     */
    reclaimValues() {
        if (this.consumer) {
            this.initialValues = this.consumer.releaseValues();
        }

        this.#reclaimed = true;
        this.#announcements.length = 0;

        // Don't clear dirty state here — the buffer will flush remaining dirty data during shutdown.  After
        // reclaimValues the data lives in initialValues, and flush() reads from there as a fallback.
    }

    get version() {
        return this.#version;
    }

    set version(_version: number) {
        throw new InternalError("Datasource version must be set via externalSet");
    }

    invalidateVersion() {
        this.#version = Datasource.UNKNOWN_VERSION;
    }

    async forgetVersion() {
        if (this.#erased) {
            return;
        }
        this.#version = Datasource.UNKNOWN_VERSION;

        // A flush that is running may have taken the old version already; it must land before the unknown version does
        await this.#buffer?.settled();

        await this.#persistInOrder(localWriter =>
            localWriter.persist(this.#endpointNumber, this.#behaviorId, {
                [DatasourceCache.VERSION_KEY]: Datasource.UNKNOWN_VERSION,
            }),
        );
    }

    get erased() {
        return this.#erased;
    }

    /**
     * Disable this cache in memory without touching persisted storage.
     */
    discard() {
        this.#erased = true;
        this.#announcements.length = 0;
        this.#dirtyKeys.clear();
        this.#buffer?.removeDirty(this);
    }

    /**
     * Erase values just for this datasource.  After this call, {@link externalSet} is permanently disabled.
     */
    async erase() {
        this.discard();
        await this.#localWriter?.erase(this.#endpointNumber, this.#behaviorId);
    }

    /**
     * Re-add keys that were cleared during a successful {@link flush} but whose transaction subsequently failed to
     * commit.  Without this, a commit failure would silently lose buffered writes.
     */
    restoreDirtyKeys(keys: Set<string>) {
        if (this.#erased) {
            return;
        }
        for (const key of keys) {
            this.#dirtyKeys.add(key);
        }
    }

    /**
     * Flush dirty values to storage.  When {@link tx} is provided, writes go through the shared transaction.
     *
     * Returns the set of keys that were flushed, so the caller can restore them via {@link restoreDirtyKeys} if
     * the enclosing transaction fails to commit.
     */
    async flush(tx?: StorageDriver.Transaction): Promise<Set<string> | undefined> {
        if (this.#erased || !this.#dirtyKeys.size) {
            return;
        }

        // Snapshot and remove keys atomically.  If externalSet() re-dirties a key during our async persist,
        // it re-adds to dirtyKeys and survives.  On failure we restore the snapshot.
        const flushing = new Set(this.#dirtyKeys);
        for (const key of flushing) {
            this.#dirtyKeys.delete(key);
        }

        // The datasource holds attribute values only; our own metadata is written below, so a report that carried
        // nothing but a new version leaves no attribute to look up and still has something to persist
        const attributeKeys = new Set<string>();
        for (const key of flushing) {
            if (!key.startsWith("__")) {
                attributeKeys.add(key);
            }
        }

        // Prefer live values from the Datasource.  After reclaimValues() the Datasource's values are empty,
        // so fall back to initialValues which holds the reclaimed data.
        let values = this.consumer?.readValues(attributeKeys);
        if (values === undefined || !Object.keys(values).length) {
            if (this.initialValues !== undefined) {
                values = {};
                for (const key of attributeKeys) {
                    if (key in this.initialValues) {
                        values[key] = this.initialValues[key];
                    }
                }
            }
        }

        if (attributeKeys.size && (values === undefined || !Object.keys(values).length)) {
            // Values vanished between marking dirty and flushing; restore keys and re-mark so the buffer
            // retries on the next cycle
            for (const key of flushing) {
                this.#dirtyKeys.add(key);
            }
            this.#buffer?.markDirty(this);
            return;
        }

        values ??= {};
        values[DatasourceCache.VERSION_KEY] = this.#version;

        try {
            if (tx && this.#localWriter) {
                await this.#localWriter.persistInTransaction(tx, this.#endpointNumber, this.#behaviorId, values);
            } else {
                await this.#localWriter?.persist(this.#endpointNumber, this.#behaviorId, values);
            }
        } catch (e) {
            // Restore keys so they are retried on the next flush
            for (const key of flushing) {
                this.#dirtyKeys.add(key);
            }
            throw e;
        }

        return flushing;
    }
}

export namespace DatasourceCache {
    /**
     * Standard key for storing the version.
     *
     * This conveys the version to the {@link Datasource}.
     */
    export const VERSION_KEY = "__version__";

    export interface Options {
        writer: RemoteWriter;
        nodeId: string;
        endpointNumber: EndpointNumber;
        behaviorId: string;
        initialValues?: Val.Struct;
        localWriter?: LocalWriter;
        buffer?: ClientCacheBuffer;
    }
}
