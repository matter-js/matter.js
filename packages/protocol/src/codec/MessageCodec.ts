/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Mark } from "#common/Mark.js";
import type { ExchangeLogContext } from "#protocol/MessageExchange.js";
import {
    Bytes,
    CRYPTO_AEAD_MIC_LENGTH_BYTES,
    DataReader,
    DataWriter,
    Diagnostic,
    Endian,
    hex,
    InternalError,
    NotImplementedError,
    UnexpectedDataError,
} from "@matter/general";
import {
    BDX_PROTOCOL_ID,
    BdxMessageType,
    GroupId,
    INTERACTION_PROTOCOL_ID,
    NodeId,
    SECURE_CHANNEL_PROTOCOL_ID,
    SecureMessageType,
} from "@matter/types";
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
    /** Optional pre-serialized (and possibly privacy-obfuscated) header bytes; used instead of re-encoding `header`. */
    headerBytes?: Bytes;
}

export interface DecodedPacket extends Packet {
    header: DecodedPacketHeader;
    /** For privacy-enhanced packets: the still-obfuscated header region (message counter + node/group IDs). */
    privacyHeader?: Bytes;
}

export interface Message {
    packetHeader: PacketHeader;
    payloadHeader: PayloadHeader;
    securityExtension?: Bytes;
    payload: Bytes;
}

export namespace Message {
    export function via({ via }: { via: string }, { packetHeader: { messageId } }: Message) {
        return Diagnostic.via(`${via}${Mark.MESSAGE}${hex.fixed(messageId, 8)}`);
    }

    export function diagnosticsOf(context: { via: string }, message: Message, logContext?: ExchangeLogContext) {
        const {
            packetHeader: { hasPrivacyEnhancements },
            payloadHeader: { messageType, protocolId, ackedMessageId, requiresAck },
            payload,
        } = message;

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
                id: Message.via(context, message),
                type,
                acked: ackedMessageId === undefined ? undefined : hex.fixed(ackedMessageId, 8),
                msgFlags: Diagnostic.asFlags({
                    reqAck: requiresAck,
                    dup: duplicate,
                    privacy: hasPrivacyEnhancements,
                }),
                size: payload.byteLength ? payload.byteLength : undefined,
                payload: payload.byteLength ? payload : undefined,
            },
            true,
        );
    }
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

        case BDX_PROTOCOL_ID: {
            return { type, for: `BDX/${BdxMessageType[messageType] ?? msgTypeHex}` };
        }

        // TODO Add UDC once we support it

        default:
            return { type };
    }
}

export class MessageCodec {
    /**
     * Decode the cleartext header prefix (flags, sessionId, securityFlags) and optionally the obfuscated
     * header region for privacy-enhanced packets. Returns parsed fields for cleartext portion and raw
     * obfuscated region for privacy packets.
     */
    static decodeFixedHeader(data: Bytes): {
        flags: number;
        sessionType: SessionType;
        hasPrivacyEnhancements: boolean;
        hasMessageExtensions: boolean;
        sessionId: number;
        securityFlags: number;
        messageId?: number;
        sourceNodeId?: bigint;
        destNodeId?: bigint;
        destGroupId?: number;
        obfuscatedRegion?: Bytes;
        /** Bytes following the fixed (and, for privacy packets, obfuscated) header — the encrypted/cleartext tail. */
        applicationPayload: Bytes;
    } {
        const reader = new DataReader(data, Endian.Little);

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
        const isControlMessage = (securityFlags & SecurityFlag.IsControlMessage) !== 0;
        if (isControlMessage) {
            throw new NotImplementedError(`Control Messages not supported.`);
        }
        const hasMessageExtensions = (securityFlags & SecurityFlag.HasMessageExtension) !== 0;

        if (hasPrivacyEnhancements) {
            if (hasMessageExtensions) {
                throw new NotImplementedError(`Privacy enhancements with message extensions not supported.`);
            }
            const privacyHeaderLength = 4 + (hasSourceNodeId ? 8 : 0) + (hasDestNodeId ? 8 : hasDestGroupId ? 2 : 0);
            if (reader.remainingBytesCount < privacyHeaderLength) {
                throw new UnexpectedDataError(
                    `Privacy header length ${privacyHeaderLength} exceeds remaining message size ${reader.remainingBytesCount}.`,
                );
            }
            const obfuscatedRegion = reader.readByteArray(privacyHeaderLength);
            return {
                flags,
                sessionType,
                hasPrivacyEnhancements: true,
                hasMessageExtensions: false,
                sessionId,
                securityFlags,
                obfuscatedRegion,
                applicationPayload: reader.remainingBytes,
            };
        }

        const messageId = reader.readUInt32();
        const sourceNodeId = hasSourceNodeId ? reader.readUInt64() : undefined;
        const destNodeId = hasDestNodeId ? reader.readUInt64() : undefined;
        const destGroupId = hasDestGroupId ? reader.readUInt16() : undefined;

        return {
            flags,
            sessionType,
            hasPrivacyEnhancements: false,
            hasMessageExtensions,
            sessionId,
            securityFlags,
            messageId,
            sourceNodeId,
            destNodeId,
            destGroupId,
            applicationPayload: reader.remainingBytes,
        };
    }

    static decodePacket(data: Bytes): DecodedPacket {
        const {
            sessionType,
            hasPrivacyEnhancements,
            hasMessageExtensions,
            sessionId,
            securityFlags,
            messageId,
            sourceNodeId,
            destNodeId,
            destGroupId,
            obfuscatedRegion,
            applicationPayload,
        } = MessageCodec.decodeFixedHeader(data);

        if (hasPrivacyEnhancements) {
            // decodeFixedHeader sets obfuscatedRegion whenever privacy is enabled; assert the invariant for the type.
            if (obfuscatedRegion === undefined) {
                throw new UnexpectedDataError("Privacy-enhanced packet is missing its obfuscated header region.");
            }
            // Reject early: the privacy nonce is derived from the MIC, so a packet without a full MIC must not proceed.
            if (applicationPayload.byteLength < CRYPTO_AEAD_MIC_LENGTH_BYTES) {
                throw new UnexpectedDataError(
                    `Privacy-enhanced message too short to contain a MIC: ${applicationPayload.byteLength} bytes remaining.`,
                );
            }
            return {
                header: {
                    securityFlags,
                    sessionId,
                    sessionType,
                    hasPrivacyEnhancements: true,
                    isControlMessage: false,
                    hasMessageExtensions: false,
                    messageId: 0,
                    sourceNodeId: undefined,
                    destNodeId: undefined,
                    destGroupId: undefined,
                },
                privacyHeader: obfuscatedRegion,
                applicationPayload,
            };
        }

        // decodeFixedHeader always reads the counter for non-privacy packets; assert the invariant for the type.
        if (messageId === undefined) {
            throw new UnexpectedDataError("Message is missing its message counter.");
        }

        const header: DecodedPacketHeader = {
            securityFlags,
            sessionId,
            sourceNodeId: sourceNodeId === undefined ? undefined : NodeId(sourceNodeId),
            messageId,
            destGroupId: destGroupId === undefined ? undefined : GroupId(destGroupId),
            destNodeId: destNodeId === undefined ? undefined : NodeId(destNodeId),
            sessionType,
            hasPrivacyEnhancements: false,
            isControlMessage: false,
            hasMessageExtensions,
        };

        let messageExtension: Bytes | undefined = undefined;
        let payload = applicationPayload;
        if (hasMessageExtensions) {
            const reader = new DataReader(applicationPayload, Endian.Little);
            const extensionLength = reader.readUInt16();
            if (extensionLength > reader.remainingBytesCount) {
                throw new UnexpectedDataError(
                    `Message extension length ${extensionLength} exceeds remaining message size ${reader.remainingBytesCount}.`,
                );
            }
            messageExtension = reader.readByteArray(extensionLength);
            payload = reader.remainingBytes;
        }

        return {
            header,
            messageExtension,
            applicationPayload: payload,
        };
    }

    /**
     * Decode the message counter and node/group IDs from a deobfuscated privacy header region. Presence of each field
     * is determined from the (cleartext) message flags byte.
     */
    static decodeObfuscatedHeaderFields(
        messageFlags: number,
        region: Bytes,
    ): Pick<DecodedPacketHeader, "messageId" | "sourceNodeId" | "destNodeId" | "destGroupId"> {
        const hasDestNodeId = (messageFlags & PacketHeaderFlag.HasDestNodeId) !== 0;
        const hasDestGroupId = (messageFlags & PacketHeaderFlag.HasDestGroupId) !== 0;
        const hasSourceNodeId = (messageFlags & PacketHeaderFlag.HasSourceNodeId) !== 0;

        if (hasDestNodeId && hasDestGroupId)
            throw new UnexpectedDataError(
                "The header cannot contain destination group and node at the same time. Reserved for future use. Discard message.",
            );

        const expectedLength = 4 + (hasSourceNodeId ? 8 : 0) + (hasDestNodeId ? 8 : hasDestGroupId ? 2 : 0);
        if (region.byteLength < expectedLength) {
            throw new UnexpectedDataError(
                `Privacy header region length ${region.byteLength} is shorter than expected ${expectedLength}.`,
            );
        }

        const reader = new DataReader(region, Endian.Little);
        const messageId = reader.readUInt32();
        const sourceNodeId = hasSourceNodeId ? NodeId(reader.readUInt64()) : undefined;
        const destNodeId = hasDestNodeId ? NodeId(reader.readUInt64()) : undefined;
        const destGroupId = hasDestGroupId ? GroupId(reader.readUInt16()) : undefined;

        return { messageId, sourceNodeId, destNodeId, destGroupId };
    }

    static decodePayload({ header, applicationPayload }: DecodedPacket): DecodedMessage {
        const reader = new DataReader(applicationPayload, Endian.Little);
        const payloadHeader = this.decodePayloadHeader(reader);
        let securityExtension: Bytes | undefined = undefined;
        if (payloadHeader.hasSecuredExtension) {
            const extensionLength = reader.readUInt16();
            if (extensionLength > reader.remainingBytesCount) {
                throw new UnexpectedDataError(
                    `Secured extension length ${extensionLength} exceeds remaining message size ${reader.remainingBytesCount}.`,
                );
            }
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

    static encodePacket({ header, applicationPayload, messageExtension, headerBytes }: Packet): Bytes {
        if (messageExtension !== undefined || header.hasMessageExtensions) {
            throw new NotImplementedError(`Message extensions not supported when encoding a packet.`);
        }
        return Bytes.concat(headerBytes ?? this.encodePacketHeader(header), applicationPayload);
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
        const protocolId = vendorId * 0x10000 + reader.readUInt16();
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
        hasPrivacyEnhancements,
    }: PacketHeader) {
        if (
            sessionType === SessionType.Group &&
            (destGroupId === undefined || sourceNodeId === undefined || destNodeId !== undefined)
        ) {
            throw new InternalError(
                `Group session must have a destination group id and a source node id and no destination node id.`,
            );
        }
        const writer = new DataWriter(Endian.Little);
        const flags =
            (HEADER_VERSION << 4) |
            (destGroupId !== undefined ? PacketHeaderFlag.HasDestGroupId : 0) |
            (destNodeId !== undefined ? PacketHeaderFlag.HasDestNodeId : 0) |
            (sourceNodeId !== undefined ? PacketHeaderFlag.HasSourceNodeId : 0);
        const securityFlags = sessionType | (hasPrivacyEnhancements ? SecurityFlag.HasPrivacyEnhancements : 0);

        writer.writeUInt8(flags);
        writer.writeUInt16(sessionId);
        writer.writeUInt8(securityFlags);
        writer.writeUInt32(messageCounter);
        if (sourceNodeId !== undefined) writer.writeUInt64(sourceNodeId);
        if (destNodeId !== undefined) writer.writeUInt64(destNodeId);
        if (destGroupId !== undefined) writer.writeUInt16(destGroupId);
        return writer.toByteArray();
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
        const vendorId = (protocolId & 0xffff0000) >>> 16;
        const flags =
            (isInitiatorMessage ? PayloadHeaderFlag.IsInitiatorMessage : 0) |
            (ackedMessageCounter !== undefined ? PayloadHeaderFlag.IsAckMessage : 0) |
            (requiresAck ? PayloadHeaderFlag.RequiresAck : 0) |
            (vendorId !== COMMON_VENDOR_ID ? PayloadHeaderFlag.HasVendorId : 0);

        writer.writeUInt8(flags);
        writer.writeUInt8(messageType);
        writer.writeUInt16(exchangeId);
        if (vendorId !== COMMON_VENDOR_ID) {
            writer.writeUInt16(vendorId);
        }
        writer.writeUInt16(protocolId & 0xffff);
        if (ackedMessageCounter !== undefined) writer.writeUInt32(ackedMessageCounter);
        return writer.toByteArray();
    }
}
