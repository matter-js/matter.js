/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import type { Fabric } from "#fabric/Fabric.js";
import { BasicMap, Bytes, InternalError, MatterFlowError, StorageContext } from "#general";
import { GroupKeySet, KeySets, OperationalKeySet } from "#groups/KeySets.js";
import { MessagingState } from "#groups/MessagingState.js";
import { GroupId, MATTER_EPOCH_OFFSET_US } from "#types";
import { Groups } from "./Groups.js";

export const GROUP_SECURITY_INFO = Bytes.fromString("GroupKey v1.0");

export const IPK_DEFAULT_EPOCH_START_TIME = MATTER_EPOCH_OFFSET_US;
/**
 * Class that contains an operational view on the Group Keys for a fabric
 */
export class FabricGroups {
    #fabric: Fabric;
    #groups: Groups;
    #messagingState: MessagingState;

    /** Operationally enhanced variants of the group key sets based on their ID. */
    #keySets = new KeySets();

    constructor(fabric: Fabric, storage?: StorageContext) {
        this.#fabric = fabric;
        this.#groups = new Groups(fabric, this.#keySets);
        this.#messagingState = new MessagingState(fabric.crypto, storage);

        // KeySet with ID 0 is always the Fabric IPK, so we initialize from there because this is not stored
        // in Key Management Cluster
        this.#keySets.add({
            groupKeySetId: 0,
            epochKey0: fabric.identityProtectionKey,
            operationalEpochKey0: fabric.operationalIdentityProtectionKey,
            epochStartTime0: IPK_DEFAULT_EPOCH_START_TIME, // with the Year 2000-offset that's basically 0 and always ok, but only for the IPK key
            groupSessionId0: null,
            epochKey1: null,
            operationalEpochKey1: null,
            epochStartTime1: null,
            groupSessionId1: null,
            epochKey2: null,
            operationalEpochKey2: null,
            epochStartTime2: null,
            groupSessionId2: null,
            groupKeySecurityPolicy: 0, // GroupKeyManagement.GroupKeySecurityPolicy.TrustFirst, the other option is provisional
            groupKeyMulticastPolicy: 0, // GroupKeyManagement.GroupKeyMulticastPolicy.PerGroupId, provisional!
        });
        if (storage !== undefined) {
            this.storage = storage;
        }
    }

    set storage(storage: StorageContext) {
        this.#messagingState.storage = storage;
    }

    /** Operative lookup of the group key sets by their id. */
    get keySets(): KeySets<OperationalKeySet> {
        return this.#keySets;
    }

    get messaging(): MessagingState {
        return this.#messagingState;
    }

    /** Operative lookup of the group key set id and the key by a group session Id. */
    get sessions() {
        return this.#keySets.sessions;
    }

    get groupKeyIdMap(): BasicMap<GroupId, number> {
        return this.#groups.idMap;
    }

    set groupKeyIdMap(map: Map<GroupId, number>) {
        this.#groups.idMap = map;
    }

    get endpoints() {
        return this.#groups.endpointMap;
    }

    currentKeyForGroup(groupId: GroupId) {
        return this.#groups.currentKeyForId(groupId);
    }

    subjectForGroup(id: GroupId, keySetId: number) {
        return this.#groups.subjectForGroup(id, keySetId);
    }

    multicastAddressFor(groupId: GroupId): string {
        return this.#groups.multicastAddress(groupId);
    }

    /*
    TODO for Controller to generate new epochs
    addGroupEpoch(groupKeySetId: number, startTimeMs = Time.nowMs) {
        // TODO for Controller to generate new epochs
        const epochKey = Crypto.getRandomData(CRYPTO_SYMMETRIC_KEY_LENGTH);
        const operationalEpochKey = Crypto.hkdf(epochKey, this.#fabric.operationalId, GROUP_SECURITY_INFO);
        const epochStartTime = startTimeMs * 1000;
        logger.debug(`addGroupEpoch: epochStartTime=${epochStartTime}`, operationalEpochKey);
        // TODO extend in structure and such
    }
    */

    /**
     * Sets new group key set data and pre-calculates all operative data like session ids and operational keys.
     * Overwriting the existing one if it exists.
     */
    async setFromGroupKeySet(groupKeySet: GroupKeySet) {
        const { groupKeySetId, epochKey0, epochKey1, epochKey2 } = groupKeySet;

        if (epochKey0 === null) {
            throw new MatterFlowError("EpochKey0 must be set"); // checked before, but to make typing happy
        }

        // Clean up the counters and data from old keys, will be initialized again on next use
        await this.#cleanUpCounters(groupKeySetId);

        // Lets pre-calculate the operational keys
        const operationalId = this.#fabric.operationalId;
        const operationalEpochKey0 = await this.#fabric.crypto.createHkdfKey(
            epochKey0,
            operationalId,
            GROUP_SECURITY_INFO,
        );
        const operationalEpochKey1 =
            epochKey1 !== null
                ? await this.#fabric.crypto.createHkdfKey(epochKey1, operationalId, GROUP_SECURITY_INFO)
                : null;
        const operationalEpochKey2 =
            epochKey2 !== null
                ? await this.#fabric.crypto.createHkdfKey(epochKey2, operationalId, GROUP_SECURITY_INFO)
                : null;
        this.#keySets.add({
            ...groupKeySet,
            operationalEpochKey0,
            groupSessionId0: await this.#keySets.sessionIdFromKey(this.#fabric.crypto, operationalEpochKey0),
            operationalEpochKey1,
            groupSessionId1:
                operationalEpochKey1 !== null
                    ? await this.#keySets.sessionIdFromKey(this.#fabric.crypto, operationalEpochKey1)
                    : null,
            operationalEpochKey2,
            groupSessionId2:
                operationalEpochKey2 !== null
                    ? await this.#keySets.sessionIdFromKey(this.#fabric.crypto, operationalEpochKey2)
                    : null,
        });
    }

    /** Removes a group key set by its id and cleans up the counters and data. */
    async removeGroupKeySet(groupKeySetId: number) {
        if (groupKeySetId === 0) {
            throw new InternalError("Cannot remove the group key set 0.");
        }
        await this.#cleanUpCounters(groupKeySetId, true);
        return this.#keySets.delete("groupKeySetId", groupKeySetId);
    }

    /** Cleans up the counters and data for a group key set by its id. */
    async #cleanUpCounters(groupKeySetId: number, forDelete = false) {
        if (this.#keySets.forId(groupKeySetId) === undefined) {
            return;
        }

        // Clean up counters for the group key set
        const operationalKeys = this.#keySets.allKeysForId(groupKeySetId);
        for (const { key } of operationalKeys) {
            await this.#messagingState.removeCounter(key, forDelete);
        }
    }
}
