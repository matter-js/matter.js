/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OperationalAddress } from "#peer/PeerDescriptor.js";
import { Bytes, Crypto, Logger } from "@matter/general";
import { FabricIndex, NodeId, SecureMessageType } from "@matter/types";
import { CheckInMessage } from "./CheckInMessage.js";

const logger = Logger.get("IcdCheckInSender");

export interface IcdCheckInSenderContext {
    crypto: Crypto;
    /** Resolve a registered client's operational address (cached address preferred; best-effort). */
    resolveAddress(input: { fabricIndex: FabricIndex; peerNodeId: NodeId }): Promise<OperationalAddress | undefined>;
    /** Send `payload` as an unsecured Secure Channel message of `messageType` to `address`. Returns false on failure. */
    sendUnsecured(address: OperationalAddress, messageType: number, payload: Bytes): Promise<boolean>;
}

export interface IcdCheckInRequest {
    fabricIndex: FabricIndex;
    peerNodeId: NodeId;
    key: Bytes;
    counter: number;
    /** Active-mode threshold in milliseconds (uint16 on the wire). */
    activeModeThreshold: number;
}

/**
 * Builds and sends device-side ICD Check-In messages (Secure Channel opcode 0x50) unsecured to a registered client.
 * Best-effort transport: returns false (does not throw) when the peer is unresolvable or the send fails. Encode-time
 * and programmer errors are NOT transport failures and propagate.
 *
 * @see {@link MatterSpecification.v16.Core} § 9.15.1
 */
export class IcdCheckInSender {
    readonly #context: IcdCheckInSenderContext;

    constructor(context: IcdCheckInSenderContext) {
        this.#context = context;
    }

    async send(request: IcdCheckInRequest): Promise<boolean> {
        const { fabricIndex, peerNodeId, key, counter, activeModeThreshold } = request;

        let address: OperationalAddress | undefined;
        try {
            address = await this.#context.resolveAddress({ fabricIndex, peerNodeId });
        } catch (error) {
            logger.debug(`Check-In to ${peerNodeId} on fabric ${fabricIndex}: address resolution failed`, error);
            return false;
        }
        if (address === undefined) {
            return false;
        }

        // An encode failure is a programmer/crypto bug, not a delivery failure, so it must surface rather than be
        // swallowed as a best-effort `false`.
        const payload = await CheckInMessage.encodeIcd(this.#context.crypto, key, counter, activeModeThreshold);

        try {
            return await this.#context.sendUnsecured(address, SecureMessageType.IcdCheckInMessage, payload);
        } catch (error) {
            logger.debug(`Check-In to ${peerNodeId} on fabric ${fabricIndex}: send failed`, error);
            return false;
        }
    }
}
