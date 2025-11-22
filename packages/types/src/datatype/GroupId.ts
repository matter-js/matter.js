/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Branded, InternalError, UnexpectedDataError } from "#general";
import { ValidationOutOfBoundsError, validatorOf } from "../common/ValidationError.js";
import { TlvUInt16 } from "../tlv/TlvNumber.js";
import { TlvWrapper } from "../tlv/TlvWrapper.js";
import type { NodeId } from "./NodeId.js";

/**
 * A Group Identifier (Group ID or GID) is a 16-bit number that identifies a set of Nodes across a
 * Fabric at the message layer (see Section 4.15, “Group Key Management”). A Group ID can further
 * be bound to one or more Endpoints within each Node in the group at the interaction layer.
 *
 * The Group ID space is allocated as described in Table 2, “Group ID Allocations”:
 * 0x0000 - Null or unspecified Group ID
 * 0x0001 - 0xFEFF: Application Group ID, assigned by fabric Administrator
 * 0xFF00 - 0xFFFF: Universal Group ID range reserved for static multicast and anycast identifiers
 *
 * @see {@link MatterSpecification.v10.Core} § 2.5.4
 */
export type GroupId = Branded<number, "GroupId">;

export function GroupId(groupId: number, validate = true): GroupId {
    if (!validate || (groupId >= 0x0000 && groupId <= 0xffff)) {
        return Number(groupId) as GroupId;
    }
    throw new ValidationOutOfBoundsError(`Invalid group ID: ${groupId}`);
}

export namespace GroupId {
    export const NO_GROUP_ID = GroupId(0);

    /** This group is used to message all Nodes in a Fabric. */
    export const ALL_NODES = 0xffff as GroupId;

    /**
     * This group is used to message all power-capable Nodes in a Fabric. ICD Nodes SHALL NOT subscribe to this group.
     */
    export const ALL_NON_ICD_NODES = 0xfffe as GroupId;

    //export const ALL_PROXIES = 0xfffd as GroupId; // Provisional and will be removed in Matter 1.4.2

    export const isValid = validatorOf(GroupId);

    /** Application Group ID, assigned by fabric Administrator */
    export function isApplicationGroupId(groupId: GroupId): boolean {
        return groupId >= 0x0001 && groupId <= 0xfeff;
    }

    export function assertGroupId(groupId: GroupId) {
        if (groupId === GroupId.NO_GROUP_ID) {
            throw new UnexpectedDataError(`A Group ID need to be specified and can not be 0`);
        }
    }

    export function fromNodeId(nodeId: NodeId): GroupId {
        if (!isGroupNodeId(nodeId)) {
            throw new InternalError(`Node ID ${nodeId} is not a group node ID`);
        }
        // NodeId is a 64-bit value, where the lower 16 bits represent the GroupId
        const groupId = Number(nodeId & BigInt(0xffff));
        // TODO Check if 0 is allowed??
        return GroupId(groupId);
    }

    /** A Group Node ID is a 64-bit Node ID that contains a particular Group ID in the lower half of the Node ID. */
    export const isGroupNodeId = (nodeId: NodeId): boolean => {
        const nodeIdHex = nodeId.toString(16);
        return nodeIdHex.startsWith("ffffffffffff") && nodeIdHex.length === 16;
    };
}

/** Tlv Schema for a Group Id. */
export const TlvGroupId = new TlvWrapper<GroupId, number>(
    TlvUInt16,
    groupId => groupId,
    value => GroupId(value, false), // No automatic validation on decode
);
