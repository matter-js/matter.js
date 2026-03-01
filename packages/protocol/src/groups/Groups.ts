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

/** Multicast address policy for a group. IanaAddr uses the shared FF05::FA address; PerGroupId derives from GroupId. */
export type GroupMulticastPolicy = "ianaAddr" | "perGroupId";

/** IANA-assigned shared multicast address for Groupcast cluster (Matter 1.6). */
export const IANA_GROUPCAST_MULTICAST_ADDRESS = "ff05::fa";

export class Groups {
    #fabric: Fabric;
    #keySets: KeySets<OperationalKeySet>;

    /** Operational variant of the group key map attribute from Group Key Management cluster, maps group Ids to key sets. */
    readonly #groupKeyIdMap = new BasicMap<GroupId, number>();

    /** Operational variant of the group table, maps group Ids to a list of enabled endpoints. */
    readonly endpointMap = new Map<GroupId, EndpointNumber[]>();

    /** Per-group multicast address policy (Groupcast cluster, Matter 1.6). Defaults to PerGroupId when not set. */
    readonly #groupMulticastPolicy = new Map<GroupId, GroupMulticastPolicy>();

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

    /** Sets the multicast address policy for a specific group (Groupcast cluster, Matter 1.6). */
    setGroupMulticastPolicy(groupId: GroupId, policy: GroupMulticastPolicy) {
        this.#groupMulticastPolicy.set(groupId, policy);
    }

    /** Removes the multicast address policy for a specific group, reverting to the default (PerGroupId). */
    removeGroupMulticastPolicy(groupId: GroupId) {
        this.#groupMulticastPolicy.delete(groupId);
    }

    /** Returns the multicast address for a given group id for this fabric. */
    multicastAddress(groupId: GroupId) {
        GroupId.assertGroupId(groupId);

        // When the Groupcast cluster assigns IanaAddr policy, all groups in the fabric share FF05::FA.
        // Legacy groups and new groups without explicit policy use PerGroupId (fabric-derived address).
        if (this.#groupMulticastPolicy.get(groupId) === "ianaAddr") {
            return IANA_GROUPCAST_MULTICAST_ADDRESS;
        }

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
