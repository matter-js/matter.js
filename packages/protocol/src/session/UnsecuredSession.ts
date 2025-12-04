/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Mark } from "#common/Mark.js";
import { Bytes, Crypto, Diagnostic, MatterFlowError } from "#general";
import { NoAssociatedFabricError } from "#protocol/errors.js";
import { NodeId } from "#types";
import { DecodedMessage, DecodedPacket, Message, MessageCodec, Packet, SessionType } from "../codec/MessageCodec.js";
import type { Fabric } from "../fabric/Fabric.js";
import { MessageCounter } from "../protocol/MessageCounter.js";
import { MessageReceptionStateUnencryptedWithRollover } from "../protocol/MessageReceptionState.js";
import { Session } from "./Session.js";
import { SessionParameters } from "./SessionParameters.js";

export const UNICAST_UNSECURE_SESSION_ID = 0x0000;

export class UnsecuredSession extends Session {
    readonly #initiatorNodeId: NodeId;
    readonly closingAfterExchangeFinished = false;
    readonly supportsMRP = true;
    readonly type = SessionType.Unicast;

    constructor(config: UnsecuredSession.Config) {
        const { crypto, initiatorNodeId, isInitiator } = config;
        super({
            ...config,
            setActiveTimestamp: !isInitiator, // When we are the initiator we assume the node is in idle mode
            messageReceptionState: new MessageReceptionStateUnencryptedWithRollover(),
        });
        this.#initiatorNodeId = initiatorNodeId ?? NodeId.randomOperationalNodeId(crypto);
    }

    get isSecure() {
        return false;
    }

    get isPase() {
        return false;
    }

    decode(packet: DecodedPacket): DecodedMessage {
        return MessageCodec.decodePayload(packet);
    }

    encode(message: Message): Packet {
        return MessageCodec.encodePayload(message);
    }

    get attestationChallengeKey(): Bytes {
        throw new MatterFlowError("Not supported on an unsecure session");
    }

    setFabric(_fabric: Fabric): void {
        throw new MatterFlowError("Not supported on an unsecure session");
    }

    get via() {
        return Diagnostic.via(`${Mark.SESSION}unsecured#${this.#initiatorNodeId.toString(16)}`);
    }

    get id(): number {
        return UNICAST_UNSECURE_SESSION_ID;
    }

    get peerSessionId(): number {
        return UNICAST_UNSECURE_SESSION_ID;
    }

    get nodeId() {
        return this.#initiatorNodeId;
    }

    get peerNodeId() {
        return undefined;
    }

    get associatedFabric(): Fabric {
        throw new NoAssociatedFabricError("Session needs to be a secure session");
    }

    override detachChannel() {
        this.manager?.unsecuredSessions.delete(this.nodeId);
        return super.detachChannel();
    }

    override async close() {
        this.manager?.unsecuredSessions.delete(this.nodeId);
        await super.close();
    }
}

export namespace UnsecuredSession {
    export interface Config extends Session.CommonConfig {
        crypto: Crypto;
        messageCounter: MessageCounter;
        initiatorNodeId?: NodeId;
        sessionParameters?: SessionParameters.Config;
        isInitiator?: boolean;
    }
}
