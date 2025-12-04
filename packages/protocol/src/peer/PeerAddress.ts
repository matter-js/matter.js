/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DiagnosticPresentation } from "#general";
import { FabricIndex, GroupId, NodeId } from "#types";

/**
 * This is the "logical" address of a peer node consisting of a fabric and node ID.
 */
export interface PeerAddress {
    fabricIndex: FabricIndex;
    nodeId: NodeId;
}

const interned = Symbol("interned-logical-address");

const internedAddresses = new Map<FabricIndex, Map<NodeId, PeerAddress>>();

/**
 * Obtain a canonical instance of a logical address.
 *
 * This allows for identification based on object comparison.  Interned addresses render to a string in the format
 * "@<fabric index>:<node id>"
 */
export function PeerAddress<T extends undefined | PeerAddress>(address: T): T {
    if (address === undefined) {
        return undefined as T;
    }

    if (interned in address) {
        return address;
    }

    let internedFabric = internedAddresses.get(address.fabricIndex);
    if (internedFabric === undefined) {
        internedAddresses.set(address.fabricIndex, (internedFabric = new Map()));
    }

    let internedAddress = internedFabric.get(address.nodeId);
    if (internedAddress) {
        return internedAddress as T;
    }

    internedFabric.set(
        address.nodeId,
        (internedAddress = {
            ...address,

            [interned]: true,

            toString() {
                const nodeStr = this.nodeId > 0xffff ? `0x${this.nodeId.toString(16)}` : this.nodeId;
                return `peer@${this.fabricIndex}:${nodeStr}`;
            },

            get [DiagnosticPresentation.value]() {
                return this.toString();
            },
        } as PeerAddress),
    );

    return internedAddress as T;
}

export namespace PeerAddress {
    export function is(addr1?: Readonly<PeerAddress>, addr2?: Readonly<PeerAddress>) {
        if (addr1 === undefined || addr2 === undefined) {
            return false;
        }

        return addr1.fabricIndex === addr2.fabricIndex && addr1.nodeId === addr2.nodeId;
    }

    export function isGroup(address: PeerAddress): boolean {
        return GroupId.isGroupNodeId(address.nodeId);
    }
}

/**
 * A collection of items keyed by logical address.
 */
export class PeerAddressMap<T> extends Map<PeerAddress, T> {
    override delete(key: PeerAddress) {
        return super.delete(PeerAddress(key));
    }

    override has(key: PeerAddress) {
        return super.has(PeerAddress(key));
    }

    override set(key: PeerAddress, value: T) {
        return super.set(PeerAddress(key), value);
    }

    override get(key: PeerAddress) {
        return super.get(PeerAddress(key));
    }
}

export class PeerAddressSet extends Set<PeerAddress> {
    override add(value: PeerAddress) {
        return super.add(PeerAddress(value));
    }

    override has(value: PeerAddress) {
        return super.has(PeerAddress(value));
    }

    override delete(value: PeerAddress) {
        return super.delete(PeerAddress(value));
    }
}
