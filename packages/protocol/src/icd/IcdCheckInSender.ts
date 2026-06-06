/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, Logger } from "@matter/general";
import { FabricIndex, NodeId, SecureMessageType } from "@matter/types";
import { CheckInMessage } from "./CheckInMessage.js";

const logger = Logger.get("IcdCheckInSender");

/** A resolved operational address to dial, or undefined when the peer cannot be located. */
export interface IcdCheckInAddress {
    type: "udp" | "tcp";
    ip: string;
    port: number;
}

export interface IcdCheckInSenderContext {
    crypto: Crypto;
    /** Resolve a registered client's operational address (cached address preferred; best-effort). */
    resolveAddress(input: { fabricIndex: FabricIndex; peerNodeId: NodeId }): Promise<IcdCheckInAddress | undefined>;
    /** Send `payload` as an unsecured Secure Channel message of `messageType` to `address`. Returns false on failure. */
    sendUnsecured(address: IcdCheckInAddress, messageType: number, payload: Bytes): Promise<boolean>;
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
 * Best-effort: returns false (never throws) when the peer is unresolvable or the send fails.
 *
 * @see {@link MatterSpecification.v151.Core} § 9.15.1
 */
export class IcdCheckInSender {
    readonly #context: IcdCheckInSenderContext;

    constructor(context: IcdCheckInSenderContext) {
        this.#context = context;
    }

    async send(request: IcdCheckInRequest): Promise<boolean> {
        const { fabricIndex, peerNodeId, key, counter, activeModeThreshold } = request;
        try {
            const address = await this.#context.resolveAddress({ fabricIndex, peerNodeId });
            if (address === undefined) {
                return false;
            }
            const payload = await CheckInMessage.encodeIcd(this.#context.crypto, key, counter, activeModeThreshold);
            return await this.#context.sendUnsecured(address, SecureMessageType.IcdCheckInMessage, payload);
        } catch (error) {
            logger.debug(`Check-In to ${peerNodeId} on fabric ${fabricIndex} failed`, error);
            return false;
        }
    }
}
