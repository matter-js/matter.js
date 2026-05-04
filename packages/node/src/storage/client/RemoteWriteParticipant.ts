/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, Transaction } from "@matter/general";
import { Val, WriteResult } from "@matter/protocol";
import { EndpointNumber } from "@matter/types";
import type { RemoteWriter } from "./RemoteWriter.js";

const logger = Logger.get("RemoteWriteParticipant");

/**
 * A transaction participant that persists changes to a remote node.
 *
 * There is one of these for node/transaction pair.  All attributes in a transaction commit with a single interaction.
 */
export class RemoteWriteParticipant implements Transaction.Participant {
    #request: RemoteWriter.Request = [];
    #writer: RemoteWriter;
    #snapshots = new Map<string, RemoteWriteParticipant.Snapshot>();

    /**
     * There is one participant for each transaction/writer pair.  We use the writer function itself as the dedup key.
     */
    get role() {
        return this.#writer;
    }

    /**
     * Add an attribute update to the write request.
     *
     * The optional {@link snapshot} captures the pre-write values for the affected attributes plus a
     * {@link RemoteWriteParticipant.Compensator} the participant invokes if the remote rejects the write.
     */
    set(
        endpointNumber: EndpointNumber,
        behaviorId: string,
        values: Val.Struct,
        snapshot?: RemoteWriteParticipant.SnapshotInput,
    ) {
        this.#request.push({
            number: endpointNumber,
            behaviorId: behaviorId,
            values,
        });

        if (snapshot) {
            const key = snapshotKey(endpointNumber, behaviorId);
            const existing = this.#snapshots.get(key);
            if (existing) {
                Object.assign(existing.writtenValues, values);
                for (const [k, v] of Object.entries(snapshot.previousValues)) {
                    // Keep the earliest captured baseline; later writes within the same transaction don't overwrite it
                    if (!(k in existing.previousValues)) {
                        existing.previousValues[k] = v;
                    }
                }
            } else {
                this.#snapshots.set(key, {
                    compensator: snapshot.compensator,
                    previousValues: { ...snapshot.previousValues },
                    writtenValues: { ...values },
                });
            }
        }
    }

    async commit2() {
        if (!this.#request.length) {
            return;
        }

        const request = this.#request;
        const snapshots = this.#snapshots;
        this.#request = [];
        this.#snapshots = new Map();

        await this.#writer(request, failures => this.#compensate(snapshots, failures));
    }

    async #compensate(
        snapshots: Map<string, RemoteWriteParticipant.Snapshot>,
        failures: WriteResult.AttributeStatus[],
    ) {
        if (!snapshots.size) {
            return;
        }

        const failedByCluster = new Map<string, Set<string>>();
        for (const f of failures) {
            const key = snapshotKey(f.path.endpointId, String(f.path.clusterId));
            let ids = failedByCluster.get(key);
            if (!ids) {
                ids = new Set();
                failedByCluster.set(key, ids);
            }
            ids.add(String(f.path.attributeId));
        }

        for (const [key, snapshot] of snapshots) {
            const failedIds = failedByCluster.get(key);
            if (!failedIds?.size) {
                continue;
            }
            try {
                await snapshot.compensator.compensate(failedIds, snapshot.previousValues, snapshot.writtenValues);
            } catch (compensateError) {
                logger.warn(`Failed to restore local state for ${key} after remote write decline:`, compensateError);
            }
        }
    }

    rollback() {
        this.#request = [];
        this.#snapshots = new Map();
    }

    toString() {
        return `remote-writer`;
    }

    constructor(writer: RemoteWriter) {
        this.#writer = writer;
    }
}

function snapshotKey(endpointNumber: EndpointNumber | number, behaviorId: string) {
    return `${endpointNumber}|${behaviorId}`;
}

export namespace RemoteWriteParticipant {
    /**
     * Restores local cache state for attribute writes the remote device declined.
     *
     * The participant invokes this with the failed attribute keys after a write fails.  Implementations should only
     * restore values for keys present in {@link previousValues} AND only when the current local value still equals
     * what was just written — leaving concurrently-mutated values alone.
     */
    export interface Compensator {
        compensate(
            failedAttributeIds: Set<string>,
            previousValues: Val.Struct,
            writtenValues: Val.Struct,
        ): Promise<void>;
    }

    /**
     * The pre-write baseline supplied by the caller of {@link RemoteWriteParticipant.set} together with the
     * {@link Compensator} responsible for restoring it.
     */
    export interface SnapshotInput {
        compensator: Compensator;
        previousValues: Val.Struct;
    }

    /**
     * Internal per-cluster snapshot held by the participant for the duration of a transaction.
     */
    export interface Snapshot {
        compensator: Compensator;
        previousValues: Val.Struct;
        writtenValues: Val.Struct;
    }
}
