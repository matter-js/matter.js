/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Subject } from "#action/server/Subject.js";
import type { Fabric } from "#fabric/Fabric.js";
import { BasicMap, DataWriter, ImplementationError, ipv6BytesToString } from "#general";
import { EndpointNumber, GroupId } from "#types";
import { KeySets, OperationalKeySet } from "./KeySets.js";

export class Groups {
    #fabric: Fabric;
    #keySets: KeySets<OperationalKeySet>;

    /** Operational variant of the group key map attribute from Group Key Management cluster, maps group Ids to key sets. */
    readonly #groupKeyIdMap = new BasicMap<GroupId, number>();

    /** Operational variant of the group table, maps group Ids to a list of enabled endpoints. */
    readonly endpointMap = new Map<GroupId, EndpointNumber[]>();

    constructor(fabric: Fabric, keySets: KeySets<OperationalKeySet>) {
        this.#fabric = fabric;
        this.#keySets = keySets;
    }

    /** Operative lookup of the group key sets by a group id and to react on added removed groups. */
    get idMap(): BasicMap<GroupId, number> {
        return this.#groupKeyIdMap;
    }

    /** Updates the group key id map when changed in Group Key Management Cluster. Only changes are taken over. */
    set idMap(map: Map<GroupId, number>) {
        for (const [groupId, keySetId] of map.entries()) {
            this.#groupKeyIdMap.set(groupId, keySetId);
        }
        for (const groupId of this.#groupKeyIdMap.keys()) {
            if (!map.has(groupId)) {
                // If the groupId is not in the new map, we remove it from the groupKeyIdMap
                this.#groupKeyIdMap.delete(groupId);
            }
        }
    }

    subjectForGroup(id: GroupId, keySetId: number) {
        return Subject.Group({
            id,
            hasValidMapping: this.idMap.get(id) === keySetId,
            endpoints: this.endpointMap.get(id) ?? [],
        });
    }

    /** Returns the multicast address for a given group id for this fabric. */
    multicastAddress(groupId: GroupId) {
        GroupId.assertGroupId(groupId);

        // If GroupKeyMulticastPolicy ever becomes non-provisional then we need to adjust logic here, but so far we
        // just use the default which is PerGroupId, which means we use the GroupId to create the multicast address.

        const writer = new DataWriter();
        writer.writeUInt16(0xff35);
        writer.writeUInt16(0x0040);
        writer.writeUInt8(0xfd);
        writer.writeUInt64(this.#fabric.fabricId);
        writer.writeUInt8(0x00);
        writer.writeUInt16(GroupId(groupId));
        return ipv6BytesToString(writer.toByteArray());
    }

    /**
     * Returns the current operational group key for a given group id and returns the keys, start time and
     * their session IDs.
     */
    currentKeyForId(groupId: GroupId) {
        const keySetId = this.#groupKeyIdMap.get(groupId);
        if (keySetId === undefined) {
            throw new ImplementationError(`No group key set found for groupId ${groupId}.`);
        }
        return { ...this.#keySets.currentKeyForId(keySetId), keySetId };
    }
}
