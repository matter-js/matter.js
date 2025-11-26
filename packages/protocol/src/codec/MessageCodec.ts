/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    DataReader,
    DataWriter,
    Diagnostic,
    Endian,
    InternalError,
    NotImplementedError,
    UnexpectedDataError,
} from "#general";
import type { ExchangeLogContext } from "#protocol/MessageExchange.js";
import { GroupId, INTERACTION_PROTOCOL_ID, NodeId, SECURE_CHANNEL_PROTOCOL_ID, SecureMessageType } from "#types";
import { MessageType } from "../interaction/InteractionMessenger.js";

export interface PacketHeader {
    sessionId: number;
    sessionType: SessionType;
    hasPrivacyEnhancements: boolean;
    isControlMessage: boolean;
    hasMessageExtensions: boolean;
    messageId: number;
    sourceNodeId?: NodeId;
    destNodeId?: NodeId;
    destGroupId?: number;
}

export interface DecodedPacketHeader extends PacketHeader {
    securityFlags: number; // The SecurityFlags as pure data field to be used as nonce
}

export interface PayloadHeader {
    exchangeId: number;
    protocolId: number;
    messageType: number;
    isInitiatorMessage: boolean;
    requiresAck: boolean;
    ackedMessageId?: number;
    hasSecuredExtension: boolean;
}

export interface Packet {
    header: PacketHeader;
    messageExtension?: Bytes;
    applicationPayload: Bytes;
}

export interface DecodedPacket extends Packet {
    header: DecodedPacketHeader;
}
export interface Message {
    packetHeader: PacketHeader;
    payloadHeader: PayloadHeader;
    securityExtension?: Bytes;
    payload: Bytes;
}

export interface DecodedMessage extends Message {
    packetHeader: DecodedPacketHeader;
}

const HEADER_VERSION = 0x00;

export enum SessionType {
    Group = 1,
    Unicast = 0,
}

const COMMON_VENDOR_ID = 0x0000;

const enum PacketHeaderFlag {
    HasDestNodeId = 0b00000001,
    HasDestGroupId = 0b00000010,
    HasSourceNodeId = 0b00000100,
    Reserved = 0b00001000,
    VersionMask = 0b11110000,
}

const enum PayloadHeaderFlag {
    IsInitiatorMessage = 0b00000001,
    IsAckMessage = 0b00000010,
    RequiresAck = 0b00000100,
    HasSecureExtension = 0b00001000,
    HasVendorId = 0b00010000,
}

const enum SecurityFlag {
    HasPrivacyEnhancements = 0b10000000,
    IsControlMessage = 0b01000000,
    HasMessageExtension = 0b00100000,
    SessionTypeMask = 0b00000011,
}

function mapProtocolAndMessageType(protocolId: number, messageType: number): { type: string; for?: string } {
    const msgTypeHex = Diagnostic.hex(messageType);
    const type = `${Diagnostic.hex(protocolId)}/${msgTypeHex}`;
    switch (protocolId) {
        case SECURE_CHANNEL_PROTOCOL_ID: {
            return { type, for: `SC/${SecureMessageType[messageType] ?? msgTypeHex}` };
        }
        case INTERACTION_PROTOCOL_ID: {
            return { type, for: `I/${MessageType[messageType] ?? msgTypeHex}` };
        }
        // TODO Add BDX and UDC once we support it
        default:
            return { type };
    }
}

export class MessageCodec {
    static decodePacket(data: Bytes): DecodedPacket {
        const reader = new DataReader(data, Endian.Little);
        const header = this.decodePacketHeader(reader);

        let messageExtension: Bytes | undefined = undefined;
        if (header.hasMessageExtensions) {
            const extensionLength = reader.readUInt16();
            messageExtension = reader.readByteArray(extensionLength);
        }

        const applicationPayload = reader.remainingBytes;
        return {
            header,
            messageExtension,
            applicationPayload,
        };
    }

    static decodePayload({ header, applicationPayload }: DecodedPacket): DecodedMessage {
        const reader = new DataReader(applicationPayload, Endian.Little);
        const payloadHeader = this.decodePayloadHeader(reader);
        let securityExtension: Bytes | undefined = undefined;
        if (payloadHeader.hasSecuredExtension) {
            const extensionLength = reader.readUInt16();
            securityExtension = reader.readByteArray(extensionLength);
        }

        if (header.sessionType === SessionType.Group && !header.isControlMessage) {
            if (payloadHeader.requiresAck || payloadHeader.ackedMessageId) {
                throw new UnexpectedDataError(`Group data messages cannot have requiresAck or ackedMessageId set.`);
            }
        }

        return {
            packetHeader: header,
            payloadHeader,
            securityExtension,
            payload: reader.remainingBytes,
        };
    }

    static encodePayload({ packetHeader, payloadHeader, payload, securityExtension }: Message): Packet {
        if (securityExtension !== undefined || payloadHeader.hasSecuredExtension) {
            throw new NotImplementedError(`Security extensions not supported when encoding a payload.`);
        }

        return {
            header: packetHeader,
            applicationPayload: Bytes.concat(this.encodePayloadHeader(payloadHeader), payload),
        };
    }

    static encodePacket({ header, applicationPayload, messageExtension }: Packet): Bytes {
        if (messageExtension !== undefined || header.hasMessageExtensions) {
            throw new NotImplementedError(`Message extensions not supported when encoding a packet.`);
        }
        return Bytes.concat(this.encodePacketHeader(header), applicationPayload);
    }

    private static decodePacketHeader(reader: DataReader<Endian.Little>): DecodedPacketHeader {
        // Read and parse message flags
        const flags = reader.readUInt8();
        const version = (flags & PacketHeaderFlag.VersionMask) >> 4;
        const hasDestNodeId = (flags & PacketHeaderFlag.HasDestNodeId) !== 0;
        const hasDestGroupId = (flags & PacketHeaderFlag.HasDestGroupId) !== 0;
        const hasSourceNodeId = (flags & PacketHeaderFlag.HasSourceNodeId) !== 0;

        if (hasDestNodeId && hasDestGroupId)
            throw new UnexpectedDataError(
                "The header cannot contain destination group and node at the same time. Reserved for future use. Discard message.",
            );
        if (version !== HEADER_VERSION) throw new NotImplementedError(`Unsupported header version ${version}.`);

        const sessionId = reader.readUInt16();
        const securityFlags = reader.readUInt8();
        const messageId = reader.readUInt32();
        const sourceNodeId = hasSourceNodeId ? NodeId(reader.readUInt64()) : undefined;
        const destNodeId = hasDestNodeId ? NodeId(reader.readUInt64()) : undefined;
        const destGroupId = hasDestGroupId ? GroupId(reader.readUInt16()) : undefined;

        const sessionType = securityFlags & SecurityFlag.SessionTypeMask;

        if (sessionType !== SessionType.Group && sessionType !== SessionType.Unicast) {
            throw new UnexpectedDataError(`Unsupported session type ${sessionType}.`);
        }
        if (sessionType === SessionType.Unicast && hasDestGroupId) {
            throw new UnexpectedDataError(`Unicast session cannot have destination group id.`);
        }
        if (sessionType === SessionType.Group) {
            if (!hasDestGroupId && !hasDestNodeId) {
                throw new UnexpectedDataError(`Group session must have destination group id or destination node id.`);
            }
            if (!hasSourceNodeId) {
                throw new UnexpectedDataError(`Group session must have source node id.`);
            }
        }
        const hasPrivacyEnhancements = (securityFlags & SecurityFlag.HasPrivacyEnhancements) !== 0;
        if (hasPrivacyEnhancements) {
            throw new NotImplementedError(`Privacy enhancements not supported.`);
        }
        const isControlMessage = (securityFlags & SecurityFlag.IsControlMessage) !== 0;
        if (isControlMessage) {
            // And also currently not needed because MCP is not relevant
            throw new NotImplementedError(`Control Messages not supported.`);
        }
        const hasMessageExtensions = (securityFlags & SecurityFlag.HasMessageExtension) !== 0;

        return {
            securityFlags,
            sessionId,
            sourceNodeId,
            messageId,
            destGroupId,
            destNodeId,
            sessionType,
            hasPrivacyEnhancements,
            isControlMessage,
            hasMessageExtensions,
        };
    }

    private static decodePayloadHeader(reader: DataReader<Endian.Little>): PayloadHeader {
        const exchangeFlags = reader.readUInt8();
        const isInitiatorMessage = (exchangeFlags & PayloadHeaderFlag.IsInitiatorMessage) !== 0;
        const isAckMessage = (exchangeFlags & PayloadHeaderFlag.IsAckMessage) !== 0;
        const requiresAck = (exchangeFlags & PayloadHeaderFlag.RequiresAck) !== 0;
        const hasSecuredExtension = (exchangeFlags & PayloadHeaderFlag.HasSecureExtension) !== 0;
        const hasVendorId = (exchangeFlags & PayloadHeaderFlag.HasVendorId) !== 0;

        const messageType = reader.readUInt8(); // Protocol Opcode
        const exchangeId = reader.readUInt16();
        const vendorId = hasVendorId ? reader.readUInt16() : COMMON_VENDOR_ID;
        const protocolId = (vendorId << 16) | reader.readUInt16();
        const ackedMessageId = isAckMessage ? reader.readUInt32() : undefined;

        return {
            protocolId,
            exchangeId,
            messageType,
            isInitiatorMessage,
            requiresAck,
            ackedMessageId,
            hasSecuredExtension,
        };
    }

    static encodePacketHeader({
        messageId: messageCounter,
        sessionId,
        destGroupId,
        destNodeId,
        sourceNodeId,
        sessionType,
    }: PacketHeader) {
        if (
            sessionType === SessionType.Group &&
            (destGroupId === undefined || sourceNodeId === undefined || destNodeId !== undefined)
        ) {
            throw new InternalError(`Group session must have destination group id or source node id.`);
        }
        const writer = new DataWriter(Endian.Little);
        const flags =
            (HEADER_VERSION << 4) |
            (destGroupId !== undefined ? PacketHeaderFlag.HasDestGroupId : 0) |
            (destNodeId !== undefined ? PacketHeaderFlag.HasDestNodeId : 0) |
            (sourceNodeId !== undefined ? PacketHeaderFlag.HasSourceNodeId : 0);
        const securityFlags = sessionType;

        writer.writeUInt8(flags);
        writer.writeUInt16(sessionId);
        writer.writeUInt8(securityFlags);
        writer.writeUInt32(messageCounter);
        if (sourceNodeId !== undefined) writer.writeUInt64(sourceNodeId);
        if (destNodeId !== undefined) writer.writeUInt64(destNodeId);
        if (destGroupId !== undefined) writer.writeUInt16(destGroupId);
        return writer.toByteArray();
    }

    static messageDiagnostics(
        {
            packetHeader: { messageId, sessionId },
            payloadHeader: { exchangeId, messageType, protocolId, ackedMessageId, requiresAck },
            payload,
        }: Message,
        logContext?: ExchangeLogContext,
    ) {
        const duplicate = !!logContext?.duplicate;
        const forInfo = logContext?.for;
        const log = { ...logContext };
        delete log.duplicate;
        delete log.for;
        const { type, for: forType } = mapProtocolAndMessageType(protocolId, messageType);
        return Diagnostic.dict(
            {
                for: forInfo ?? forType,
                ...log,
                msgId: [sessionId, exchangeId, messageId]
                    .map(id => (id === undefined ? "?" : id.toString(16).padStart(4)))
                    .join(":"),
                type,
                acked: ackedMessageId,
                msgFlags: Diagnostic.asFlags({
                    reqAck: requiresAck,
                    dup: duplicate,
                }),
                size: payload.byteLength ? payload.byteLength : undefined,
                payload: payload.byteLength ? payload : undefined,
            },
            true,
        );
    }

    private static encodePayloadHeader({
        exchangeId,
        isInitiatorMessage,
        messageType,
        protocolId,
        requiresAck,
        ackedMessageId: ackedMessageCounter,
    }: PayloadHeader) {
        const writer = new DataWriter(Endian.Little);
        const vendorId = (protocolId & 0xffff0000) >> 16;
        const flags =
            (isInitiatorMessage ? PayloadHeaderFlag.IsInitiatorMessage : 0) |
            (ackedMessageCounter !== undefined ? PayloadHeaderFlag.IsAckMessage : 0) |
            (requiresAck ? PayloadHeaderFlag.RequiresAck : 0) |
            (vendorId !== COMMON_VENDOR_ID ? PayloadHeaderFlag.HasVendorId : 0);

        writer.writeUInt8(flags);
        writer.writeUInt8(messageType);
        writer.writeUInt16(exchangeId);
        if (vendorId !== COMMON_VENDOR_ID) {
            writer.writeUInt32(protocolId);
        } else {
            writer.writeUInt16(protocolId);
        }
        if (ackedMessageCounter !== undefined) writer.writeUInt32(ackedMessageCounter);
        return writer.toByteArray();
    }
}
