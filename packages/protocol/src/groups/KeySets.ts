/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GroupKeyManagement } from "#clusters/group-key-management";
import { BasicSet, Bytes, Crypto, DataReader, ImplementationError, MatterFlowError, Time, Timestamp } from "#general";

export const GROUP_KEY_INFO = Bytes.fromString("GroupKeyHash");

export class KeySets<T extends OperationalKeySet> extends BasicSet<T> {
    /** Operational enhanced structure for fast access based on the group session id. */
    readonly #sessions = new Map<number, { keySetId: number; key: Bytes }[]>();

    get sessions() {
        return this.#sessions;
    }

    override add(item: T): void {
        this.delete("groupKeySetId", item.groupKeySetId); // Remove any existing item with the same groupKeySetId
        super.add(item);
        this.#updateSessions();
    }

    override delete<F extends keyof T>(itemOrField: T | F, value?: T[F]): boolean {
        const deleted = super.delete(itemOrField as any, value as any);
        if (deleted) {
            this.#updateSessions();
        }
        return deleted;
    }

    forId(groupKeySetId: number): OperationalKeySet | undefined {
        return this.get("groupKeySetId", groupKeySetId);
    }

    /**
     * Return an operative list of operational keys, start time and their session IDs for a specified
     * group key set id. This is mainly used for receiving messages.
     */
    allKeysForId(keySetId: number) {
        const groupKeySet = this.forId(keySetId);
        if (groupKeySet === undefined) {
            throw new MatterFlowError(`GroupKeySet for groupKeySet ${keySetId} not found.`);
        }
        const operationalKeys = Array<{ key: Bytes; sessionId?: number; startTime: Timestamp }>();
        const {
            operationalEpochKey0,
            groupSessionId0,
            epochStartTime0,
            operationalEpochKey1,
            groupSessionId1,
            epochStartTime1,
            operationalEpochKey2,
            groupSessionId2,
            epochStartTime2,
        } = groupKeySet;
        if (operationalEpochKey0 === null || epochStartTime0 === null || (keySetId !== 0 && groupSessionId0 === null)) {
            // should never happen, but just in case
            throw new MatterFlowError(`EpochKey0 for groupKeySet ${keySetId} not found.`);
        }
        operationalKeys.push({
            key: operationalEpochKey0,
            sessionId: groupSessionId0 !== null ? groupSessionId0 : undefined,
            startTime: Timestamp.fromMicroseconds(epochStartTime0),
        });
        if (operationalEpochKey1 !== null && groupSessionId1 !== null && epochStartTime1 !== null) {
            operationalKeys.push({
                key: operationalEpochKey1,
                sessionId: groupSessionId1,
                startTime: Timestamp.fromMicroseconds(epochStartTime1),
            });
        }
        if (operationalEpochKey2 !== null && groupSessionId2 !== null && epochStartTime2 !== null) {
            operationalKeys.push({
                key: operationalEpochKey2,
                sessionId: groupSessionId2,
                startTime: Timestamp.fromMicroseconds(epochStartTime2),
            });
        }
        return operationalKeys;
    }

    /**
     * Returns the current operational group key for a given group KeySet Id and returns the keys, start time and
     * their session IDs. This is mainly used for sending messages.
     */
    currentKeyForId(keySetId: number) {
        const operationalKeys = this.allKeysForId(keySetId);
        if (operationalKeys.length === 0) {
            throw new MatterFlowError(`No operational keys found for groupKeySet ${keySetId}.`);
        }
        if (keySetId === 0) {
            // Groups: For the generation of the Destination Identifier, the originator SHALL use the operational group key with
            // the second newest EpochStartTime, if one exists, otherwise it SHALL use the single operational group key available.
            // @see {@link MatterSpecification.v14.Core} § 4.14.2.6.
            if (operationalKeys.length > 2) {
                return operationalKeys[1];
            }
            return operationalKeys[0];
        } else {
            // Nodes sending group messages SHALL use operational group keys that are derived from the current
            // epoch key (specifically, the epoch key with the latest start time that is not in the future).
            // TODO Nodes that cannot reliably keep track of time calculate the current epoch key as described in
            //  Section 4.17.3.4, “Epoch Key Rotation without Time Synchronization”.
            const now = Time.nowUs;
            const relevantKeys = operationalKeys.filter(({ startTime }) => startTime <= now);
            if (relevantKeys.length === 0) {
                throw new ImplementationError(
                    `No operational keys found for groupKeySet ${keySetId} that are not in the future.`,
                );
            }
            return relevantKeys[operationalKeys.length - 1];
        }
    }

    /**
     * Returns the group key set for a given group key set id in the official data format from the Group key Management
     * cluster.
     */
    asGroupKeySet(groupKeySetId: number) {
        const groupKeySet = this.forId(groupKeySetId);
        if (groupKeySet === undefined) {
            return undefined;
        }

        const {
            epochKey0,
            epochStartTime0,
            epochKey1,
            epochStartTime1,
            epochKey2,
            epochStartTime2,
            groupKeySecurityPolicy,
            groupKeyMulticastPolicy,
        } = groupKeySet;
        return {
            groupKeySetId,
            epochKey0,
            epochStartTime0,
            epochKey1,
            epochStartTime1,
            epochKey2,
            epochStartTime2,
            groupKeySecurityPolicy,
            groupKeyMulticastPolicy,
        };
    }

    /** Calculates a group session id based on the operational group key. */
    async sessionIdFromKey(crypto: Crypto, operationalGroupKey: Bytes) {
        // GroupKeyHash is an array of 2 bytes (16 bits) per Crypto_KDF
        const groupKeyHash = await crypto.createHkdfKey(operationalGroupKey, new Uint8Array(), GROUP_KEY_INFO, 2);

        // GroupSessionId is computed by considering the GroupKeyHash as a Big-Endian value. GroupSessionId is a scalar.
        // Its use in fields within messages may cause a re-serialization into a different byte order than the one used
        // for initial generation.
        return new DataReader(groupKeyHash).readUInt16();
    }

    /**
     * Updates the group session map based on the current group key sets.
     * This is used to quickly find the operational keys by their group session id.
     */
    #updateSessions() {
        this.#sessions.clear();
        for (const [id, keySet] of this.mapOf("groupKeySetId").entries()) {
            if (id === 0) {
                // Skip the default group key set (0), as it is not used for operational keys
                continue;
            }
            if (keySet.groupSessionId0 !== null) {
                const list = this.#sessions.get(keySet.groupSessionId0) ?? [];
                list.push({ key: keySet.operationalEpochKey0, keySetId: id });
                this.#sessions.set(keySet.groupSessionId0, list);
            }
            if (keySet.groupSessionId1 !== null && keySet.operationalEpochKey1 !== null) {
                const list = this.#sessions.get(keySet.groupSessionId1) ?? [];
                list.push({ key: keySet.operationalEpochKey1, keySetId: id });
                this.#sessions.set(keySet.groupSessionId1, list);
            }
            if (keySet.groupSessionId2 !== null && keySet.operationalEpochKey2 !== null) {
                const list = this.#sessions.get(keySet.groupSessionId2) ?? [];
                list.push({ key: keySet.operationalEpochKey2, keySetId: id });
                this.#sessions.set(keySet.groupSessionId2, list);
            }
        }
    }
}

export type GroupKeySet = GroupKeyManagement.GroupKeySet;

/** Enhanced structure of GroupKeySet to include operational data for easier operational processing. */
export type OperationalKeySet = GroupKeySet & {
    operationalEpochKey0: Bytes;
    groupSessionId0: number | null;
    operationalEpochKey1: Bytes | null;
    groupSessionId1: number | null;
    operationalEpochKey2: Bytes | null;
    groupSessionId2: number | null;
};
