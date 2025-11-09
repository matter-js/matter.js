/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Datasource } from "#behavior/state/managed/Datasource.js";
import { InternalError, MaybePromise, Transaction } from "#general";
import { Val } from "#protocol";
import type { ClientEndpointStore } from "./ClientEndpointStore.js";
import type { RemoteWriteParticipant } from "./RemoteWriteParticipant.js";

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
}

export function DatasourceCache(
    store: ClientEndpointStore,
    behaviorId: string,
    initialValues: Val.Struct | undefined,
): DatasourceCache {
    let version = initialValues?.[DatasourceCache.VERSION_KEY] as number;
    if (typeof version !== "number") {
        version = Datasource.UNKNOWN_VERSION;
    }

    return {
        initialValues,

        async set(transaction: Transaction, values: Val.Struct) {
            const participant = store.participantFor(transaction) as RemoteWriteParticipant;
            participant.set(store.number, behaviorId, values);
        },

        async externalSet(values: Val.Struct) {
            if (typeof values[DatasourceCache.VERSION_KEY] === "number") {
                version = values[DatasourceCache.VERSION_KEY];
            }

            await store.set({ [behaviorId]: values });

            if (this.externalChangeListener) {
                await this.externalChangeListener(values);
            } else {
                if (!this.initialValues) {
                    this.initialValues = {};
                }
                Object.assign(this.initialValues, values);
            }
        },

        externalChangeListener: undefined,
        releaseValues: undefined,

        reclaimValues() {
            if (this.releaseValues) {
                this.initialValues = this.releaseValues();
                this.releaseValues = undefined;
            }
        },

        get version() {
            return version;
        },

        set version(_version: number) {
            throw new InternalError("Datasource version must be set via externalSet");
        },

        async erase() {
            await store.eraseStoreForBehavior(behaviorId);
        },
    };
}

export namespace DatasourceCache {
    /**
     * Standard key for storing the version.
     *
     * This conveys the version to the {@link Datasource}.
     */
    export const VERSION_KEY = "__version__";
}
