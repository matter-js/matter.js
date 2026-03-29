/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Datasource } from "#behavior/state/managed/Datasource.js";
import { InternalError, MaybePromise, StorageDriver, Transaction } from "@matter/general";
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
export interface DatasourceCache extends Datasource.ExternallyMutableStore {
    /**
     * Reset the cache to "uninitialized" state by reclaiming {@link initialValues} from an active datasource.
     */
    reclaimValues(): void;

    /**
     * Erase values just for this datasource.
     */
    erase(): MaybePromise<void>;

    /**
     * Flush dirty values to storage.  When {@link tx} is provided, writes go through the shared transaction.
     */
    flush(tx?: StorageDriver.Transaction): Promise<void>;
}

export function DatasourceCache(options: DatasourceCache.Options): DatasourceCache {
    const { writer, endpointNumber, behaviorId, initialValues, buffer } = options;

    let version = initialValues?.[DatasourceCache.VERSION_KEY] as number;
    if (typeof version !== "number") {
        version = Datasource.UNKNOWN_VERSION;
    }

    const dirtyKeys = new Set<string>();

    const cache: DatasourceCache = {
        initialValues,

        async set(transaction: Transaction, values: Val.Struct) {
            let participant = transaction.getParticipant(writer);
            if (participant === undefined) {
                participant = new RemoteWriteParticipant(writer);
                transaction.addParticipants(participant);
            }
            (participant as RemoteWriteParticipant).set(endpointNumber, behaviorId, values);
        },

        async externalSet(values: Val.StructMap) {
            const versionVal = values.get(DatasourceCache.VERSION_KEY);
            if (typeof versionVal === "number") {
                version = versionVal;
            }

            if (buffer) {
                for (const key of values.keys()) {
                    dirtyKeys.add(String(key));
                }
                buffer.markDirty(cache);
            } else {
                const valuesStruct = Object.fromEntries(values) as Val.Struct;
                await options.localWriter?.persist(endpointNumber, behaviorId, valuesStruct);
            }

            if (this.externalChangeListener) {
                await this.externalChangeListener(values);
            } else {
                if (!this.initialValues) {
                    this.initialValues = {};
                }
                const valuesStruct = Object.fromEntries(values) as Val.Struct;
                Object.assign(this.initialValues, valuesStruct);
            }
        },

        externalChangeListener: undefined,
        releaseValues: undefined,

        reclaimValues() {
            if (this.releaseValues) {
                this.initialValues = this.releaseValues();
                this.releaseValues = undefined;
            }

            // Don't clear dirty state here — the buffer will flush remaining dirty data during shutdown.  After
            // reclaimValues the data lives in initialValues, and flush() reads from there as a fallback.
        },

        get version() {
            return version;
        },

        set version(_version: number) {
            throw new InternalError("Datasource version must be set via externalSet");
        },

        async erase() {
            dirtyKeys.clear();
            buffer?.removeDirty(cache);
            await options.localWriter?.erase(endpointNumber, behaviorId);
        },

        async flush(tx?: StorageDriver.Transaction) {
            if (!dirtyKeys.size) {
                return;
            }

            // Prefer live values from the Datasource.  After reclaimValues() the Datasource's values are empty,
            // so fall back to initialValues which holds the reclaimed data.
            let values = this.readValues?.(dirtyKeys);
            if (values === undefined || !Object.keys(values).length) {
                if (this.initialValues !== undefined) {
                    values = {};
                    for (const key of dirtyKeys) {
                        if (key in this.initialValues) {
                            values[key] = this.initialValues[key];
                        }
                    }
                }
            }

            dirtyKeys.clear();

            if (values === undefined || !Object.keys(values).length) {
                return;
            }

            values[DatasourceCache.VERSION_KEY] = version;

            if (tx && options.localWriter) {
                await options.localWriter.persistInTransaction(tx, endpointNumber, behaviorId, values);
            } else {
                await options.localWriter?.persist(endpointNumber, behaviorId, values);
            }
        },
    };

    return cache;
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
