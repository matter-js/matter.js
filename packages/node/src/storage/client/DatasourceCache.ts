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

    initialValues?: Val.Struct;
    consumer?: Datasource.ExternallyMutableStore.Consumer;

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

    async set(transaction: Transaction, values: Val.Struct) {
        let participant = transaction.getParticipant(this.#writer);
        if (participant === undefined) {
            participant = new RemoteWriteParticipant(this.#writer);
            transaction.addParticipants(participant);
        }
        (participant as RemoteWriteParticipant).set(this.#endpointNumber, this.#behaviorId, values);
    }

    async externalSet(values: Val.StructMap) {
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
     * Reset the cache to "uninitialized" state by reclaiming {@link initialValues} from an active datasource.
     */
    reclaimValues() {
        if (this.consumer) {
            this.initialValues = this.consumer.releaseValues();
        }

        // Don't clear dirty state here — the buffer will flush remaining dirty data during shutdown.  After
        // reclaimValues the data lives in initialValues, and flush() reads from there as a fallback.
    }

    get version() {
        return this.#version;
    }

    set version(_version: number) {
        throw new InternalError("Datasource version must be set via externalSet");
    }

    /**
     * Erase values just for this datasource.
     */
    async erase() {
        this.#dirtyKeys.clear();
        this.#buffer?.removeDirty(this);
        await this.#localWriter?.erase(this.#endpointNumber, this.#behaviorId);
    }

    /**
     * Flush dirty values to storage.  When {@link tx} is provided, writes go through the shared transaction.
     */
    async flush(tx?: StorageDriver.Transaction) {
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
