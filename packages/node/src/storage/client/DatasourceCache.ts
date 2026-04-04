/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Datasource } from "#behavior/state/managed/Datasource.js";
import { InternalError, StorageDriver, Transaction } from "@matter/general";
import { Val } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";
import type { ClientCacheBuffer } from "./ClientCacheBuffer.js";
import type { LocalWriter } from "./LocalWriter.js";
import { RemoteWriteParticipant } from "./RemoteWriteParticipant.js";
import type { RemoteWriter } from "./RemoteWriter.js";

/**
 * The default implementation of {@link Datasource.ExternallyMutableStore}.
 *
 * This implements storage for attribute values for a single cluster loaded from peers.
 */
export class DatasourceCache implements Datasource.ExternallyMutableStore {
    #writer: RemoteWriter;
    #endpointNumber: EndpointNumber;
    #behaviorId: string;
    #localWriter?: LocalWriter;
    #buffer?: ClientCacheBuffer;
    #version: number;
    #dirtyKeys = new Set<string>();
    #erased = false;
    #reclaimed = false;
    #consumer?: Datasource.ExternallyMutableStore.Consumer;

    initialValues?: Val.Struct;

    constructor(options: DatasourceCache.Options) {
        this.#writer = options.writer;
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
        }
    }

    async set(transaction: Transaction, values: Val.Struct) {
        let participant = transaction.getParticipant(this.#writer);
        if (participant === undefined) {
            participant = new RemoteWriteParticipant(this.#writer);
            transaction.addParticipants(participant);
        }
        (participant as RemoteWriteParticipant).set(this.#endpointNumber, this.#behaviorId, values);
    }

    async externalSet(values: Val.StructMap) {
        if (this.#erased || this.#reclaimed) {
            return;
        }

        const versionVal = values.get(DatasourceCache.VERSION_KEY);
        if (typeof versionVal === "number") {
            this.#version = versionVal;
        }

        if (this.#buffer) {
            for (const key of values.keys()) {
                this.#dirtyKeys.add(String(key));
            }
            this.#buffer.markDirty(this);
        } else {
            const valuesStruct = Object.fromEntries(values) as Val.Struct;
            await this.#localWriter?.persist(this.#endpointNumber, this.#behaviorId, valuesStruct);
        }

        if (this.consumer) {
            await this.consumer.integrateExternalChange(values);
        } else {
            if (!this.initialValues) {
                this.initialValues = {};
            }
            const valuesStruct = Object.fromEntries(values) as Val.Struct;
            Object.assign(this.initialValues, valuesStruct);
        }
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

        // Don't clear dirty state here — the buffer will flush remaining dirty data during shutdown.  After
        // reclaimValues the data lives in initialValues, and flush() reads from there as a fallback.
    }

    get version() {
        return this.#version;
    }

    set version(_version: number) {
        throw new InternalError("Datasource version must be set via externalSet");
    }

    get erased() {
        return this.#erased;
    }

    /**
     * Erase values just for this datasource.  After this call, {@link externalSet} is permanently disabled.
     */
    async erase() {
        this.#erased = true;
        this.#dirtyKeys.clear();
        this.#buffer?.removeDirty(this);
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
        if (!this.#dirtyKeys.size) {
            return;
        }

        // Snapshot and remove keys atomically.  If externalSet() re-dirties a key during our async persist,
        // it re-adds to dirtyKeys and survives.  On failure we restore the snapshot.
        const flushing = new Set(this.#dirtyKeys);
        for (const key of flushing) {
            this.#dirtyKeys.delete(key);
        }

        // Prefer live values from the Datasource.  After reclaimValues() the Datasource's values are empty,
        // so fall back to initialValues which holds the reclaimed data.
        let values = this.consumer?.readValues(flushing);
        if (values === undefined || !Object.keys(values).length) {
            if (this.initialValues !== undefined) {
                values = {};
                for (const key of flushing) {
                    if (key in this.initialValues) {
                        values[key] = this.initialValues[key];
                    }
                }
            }
        }

        if (values === undefined || !Object.keys(values).length) {
            // Values vanished between marking dirty and flushing; restore keys and re-mark so the buffer
            // retries on the next cycle
            for (const key of flushing) {
                this.#dirtyKeys.add(key);
            }
            this.#buffer?.markDirty(this);
            return;
        }

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
        endpointNumber: EndpointNumber;
        behaviorId: string;
        initialValues?: Val.Struct;
        localWriter?: LocalWriter;
        buffer?: ClientCacheBuffer;
    }
}
