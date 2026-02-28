/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Datasource } from "#behavior/state/managed/Datasource.js";
import { InternalError, MaybePromise, Transaction } from "@matter/general";
import { Val } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";
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
}

export function DatasourceCache(options: DatasourceCache.Options): DatasourceCache {
    const { writer, endpointNumber, behaviorId, initialValues } = options;

    let version = initialValues?.[DatasourceCache.VERSION_KEY] as number;
    if (typeof version !== "number") {
        version = Datasource.UNKNOWN_VERSION;
    }

    return {
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

            const valuesStruct = Object.fromEntries(values) as Val.Struct;
            await options.localWriter?.persist(endpointNumber, behaviorId, valuesStruct);

            if (this.externalChangeListener) {
                await this.externalChangeListener(values);
            } else {
                if (!this.initialValues) {
                    this.initialValues = {};
                }
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
        },

        get version() {
            return version;
        },

        set version(_version: number) {
            throw new InternalError("Datasource version must be set via externalSet");
        },

        async erase() {
            await options.localWriter?.erase(endpointNumber, behaviorId);
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

    export interface Options {
        writer: RemoteWriter;
        endpointNumber: EndpointNumber;
        behaviorId: string;
        initialValues?: Val.Struct;
        localWriter?: LocalWriter;
    }
}
