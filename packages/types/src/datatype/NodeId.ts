/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GroupId } from "#datatype/GroupId.js";
import { Branded, Crypto, hex, UnexpectedDataError } from "#general";
import { TlvUInt64 } from "../tlv/TlvNumber.js";
import { TlvWrapper } from "../tlv/TlvWrapper.js";
import { CaseAuthenticatedTag } from "./CaseAuthenticatedTag.js";

/**
 * A Node Identifier (Node ID) is a 64-bit number that uniquely identifies an individual Node or a
 * group of Nodes on a Fabric.
 *
 * @see {@link MatterSpecification.v10.Core} § 2.5.5
 */
export type NodeId = Branded<bigint, "NodeId">;

export function NodeId(v: Parameters<typeof BigInt>[0]): NodeId {
    return BigInt(v) as NodeId;
}

export namespace NodeId {
    const OPERATIONAL_NODE_MIN = BigInt("0x0000000000000001");
    const OPERATIONAL_NODE_MAX = BigInt("0xFFFFFFEFFFFFFFFF");

    /**
     * The Unspecified Node ID (0x0000_0000_0000_0000) is a reserved value that never appears in messages or protocol
     * usage. It exists to mark or detect the presence of uninitialized, missing, or invalid Node IDs.
     */
    export const UNSPECIFIED_NODE_ID = NodeId(0);

    export function strOf(nodeId: NodeId) {
        return hex.fixed(nodeId, 16);
    }

    /**
     * An Operational Node ID is a 64-bit number that uniquely identifies an individual Node on a Fabric. All messages
     * must have an Operational Node ID as the source address. All unicast messages must have an Operational Node ID
     * as the destination address.
     */
    export const randomOperationalNodeId = (crypto: Crypto): NodeId => {
        while (true) {
            const randomBigInt = crypto.randomBigInt(8);
            if (randomBigInt >= OPERATIONAL_NODE_MIN && randomBigInt <= OPERATIONAL_NODE_MAX) {
                return NodeId(randomBigInt);
            }
        }
    };

    /**
     * Returns whether the given Node ID is an Operational Node ID.
     */
    export const isOperationalNodeId = (nodeId: NodeId): boolean => {
        return nodeId >= OPERATIONAL_NODE_MIN && nodeId <= OPERATIONAL_NODE_MAX;
    };

    /** A Group Node ID is a 64-bit Node ID that contains a particular Group ID in the lower half of the Node ID. */
    export const fromGroupId = (groupId: number): NodeId => {
        return NodeId(BigInt("0xFFFFFFFFFFFF" + hex.byte(GroupId(groupId))));
    };

    /**
     * A Temporary Local Node ID is a 64-bit Node ID that contains an implementation-dependent value in its lower
     * 32 bits. This allows implementations to keep track of connections or transport-layer links and similar
     * housekeeping internal usage purposes in contexts where an Operational Node ID is unavailable.
     */
    export const fromTemporaryLocalNodeId = (id: number): NodeId => {
        if (id < 0 || id > 0xffffffff) {
            throw new UnexpectedDataError(`Invalid ID: ${id}`);
        }
        return NodeId(BigInt("0xFFFFFFFE" + hex.fixed(id, 8)));
    };

    /**
     * This subrange of Node ID is used to assign an access control subject to a group of peer nodes that share a
     * single CASE session as specified in Section 6.6.2.1.2, “Subjects identified by CASE Authenticated Tag”.
     */
    export const fromCaseAuthenticatedTag = (id: CaseAuthenticatedTag): NodeId => {
        if (id < 0 || id > 0xffffffff) {
            throw new UnexpectedDataError(`Invalid CASE Authenticated tag: ${id}`);
        }
        return NodeId(BigInt("0xFFFFFFFD" + hex.fixed(id, 8)));
    };

    export const isCaseAuthenticatedTag = (nodeId: NodeId): boolean => {
        const nodeIdHex = nodeId.toString(16);
        return nodeIdHex.startsWith("fffffffd") && nodeIdHex.length === 16;
    };

    export const extractAsCaseAuthenticatedTag = (nodeId: NodeId): CaseAuthenticatedTag => {
        if (!isCaseAuthenticatedTag(nodeId)) {
            throw new UnexpectedDataError(`Invalid CASE Authenticated tag: ${nodeId}`);
        }
        return CaseAuthenticatedTag(parseInt(nodeId.toString(16).slice(8), 16));
    };

    /**
     * This subrange of Node ID is used to assign an access control subject to a particular PAKE key as specified in
     * Section 6.6.2.1.1, “PASE and Group Subjects”. An example usage would be to create an ACL entry to provide
     * administrative access to any commissioner communicating via a PASE session established with a particular pincode.
     */
    export const getFromPakeKeyIdentifier = (id: number): NodeId => {
        if (id < 0 || id > 0xffffffff) {
            throw new UnexpectedDataError(`Invalid ID: ${id}`);
        }
        return NodeId(BigInt("0xFFFFFFFB" + hex.fixed(id, 8)));
    };
}

/** Tlv schema for a Node Identifier. */
export const TlvNodeId = new TlvWrapper<NodeId, number | bigint>(
    TlvUInt64,
    nodeId => nodeId,
    value => NodeId(BigInt(value)),
);
