/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageCodec, SessionType } from "#codec/MessageCodec.js";
import { MessagePrivacy } from "#codec/MessagePrivacy.js";
import { Fabric } from "#fabric/Fabric.js";
import { MessageCounter } from "#protocol/MessageCounter.js";
import { GroupSession } from "#session/GroupSession.js";
import { Bytes, DataWriter, Endian } from "@matter/general";
import { GroupId, NodeId } from "@matter/types";

/**
 * A payload that authenticates but does not parse: the secured extension it announces is longer than the rest of the
 * payload.
 */
export const UNPARSABLE_GROUP_PAYLOAD = Bytes.fromHex("090534120100ff00");

export interface GroupDatagramOptions {
    keySetId?: number;
    groupId?: number;
    messageId?: number;
    sourceNodeId?: NodeId;
    privacy?: boolean;
    isInitiatorMessage?: boolean;
    exchangeId?: number;
    requiresAck?: boolean;
    ackedMessageId?: number;
    protocolId?: number;
    messageType?: number;
    payload?: Bytes;
}

/** A group datagram from the fabric's node, encrypted with the current key of the key set, as a sender encodes it. */
export function groupDatagram(
    fabric: Fabric,
    {
        keySetId = 1,
        groupId = 2,
        messageId = 0x1234567b,
        sourceNodeId = fabric.nodeId,
        privacy = true,
        isInitiatorMessage = true,
        exchangeId = 0x1234,
        requiresAck = false,
        ackedMessageId,
        protocolId = 0x0001,
        messageType = 0x05,
        payload = Bytes.fromHex("00112233"),
    }: GroupDatagramOptions = {},
) {
    const current = fabric.groups.keySets.currentKeyForId(keySetId);
    const session = new GroupSession({
        id: current.sessionId!,
        fabric,
        keySetId,
        operationalGroupKey: current.key,
        operationalPrivacyKey: current.privacyKey,
        peerNodeId: NodeId.fromGroupId(GroupId(groupId)),
        multicastAddress: fabric.groups.multicastAddressFor(GroupId(groupId)),
        messageCounter: new MessageCounter(fabric.crypto),
    });
    return MessageCodec.encodePacket(
        session.encode({
            packetHeader: {
                sessionId: current.sessionId!,
                sessionType: SessionType.Group,
                messageId,
                destGroupId: groupId,
                sourceNodeId,
                hasPrivacyEnhancements: privacy,
                isControlMessage: false,
                hasMessageExtensions: false,
            },
            payloadHeader: {
                isInitiatorMessage,
                requiresAck,
                messageType,
                exchangeId,
                protocolId,
                ackedMessageId,
                hasSecuredExtension: false,
            },
            payload,
        }),
    );
}

/** The decoded packet and the additional authenticated data of a received datagram, as the exchange manager splits it. */
export function receivedPacket(wire: Bytes) {
    const decodedPacket = MessageCodec.decodePacket(wire);
    const aad = Bytes.of(wire).slice(0, wire.byteLength - decodedPacket.applicationPayload.byteLength);
    return { decodedPacket, aad };
}

/**
 * A group datagram without privacy for `groupId`, whose encrypted payload is `plaintext` as given.  Unlike
 * {@link groupDatagram} it does not build the payload, so the payload may be one the codec cannot decode.  The nonce
 * is written here because `Session.generateNonce` is protected.
 */
export function groupDatagramWithPlaintext(
    fabric: Fabric,
    keySetId: number,
    groupId: number,
    plaintext: Bytes,
    messageId = 0x4000,
) {
    const { key, sessionId } = fabric.groups.keySets.currentKeyForId(keySetId);
    const headerBytes = MessageCodec.encodePacketHeader({
        sessionId: sessionId!,
        sessionType: SessionType.Group,
        hasPrivacyEnhancements: false,
        isControlMessage: false,
        hasMessageExtensions: false,
        messageId,
        sourceNodeId: fabric.nodeId,
        destGroupId: groupId,
    });
    const nonce = new DataWriter(Endian.Little);
    nonce.writeUInt8(Bytes.of(headerBytes)[3]);
    nonce.writeUInt32(messageId);
    nonce.writeUInt64(fabric.nodeId);
    return Bytes.concat(headerBytes, fabric.crypto.encrypt(key, plaintext, nonce.toByteArray(), headerBytes));
}

/**
 * A privacy group datagram for group 2 with the message extension block `extensions`, encrypted with the current key of
 * key set 1.  The encoder does not write message extensions, so the datagram is built here: the block follows the
 * obfuscated region in the clear and is part of the additional authenticated data.
 */
export function privacyGroupDatagramWithExtensions(fabric: Fabric, extensions: Bytes, payload: Bytes) {
    const { key, privacyKey, sessionId } = fabric.groups.keySets.currentKeyForId(1);
    const messageId = 0x5000;
    const fixed = new DataWriter(Endian.Little);
    fixed.writeUInt8(0x06); // source node id and destination group id
    fixed.writeUInt16(sessionId!);
    fixed.writeUInt8(0xa1); // privacy, message extensions, group session
    const region = new DataWriter(Endian.Little);
    region.writeUInt32(messageId);
    region.writeUInt64(fabric.nodeId);
    region.writeUInt16(2);
    const block = new DataWriter(Endian.Little);
    block.writeUInt16(extensions.byteLength);
    const header = Bytes.concat(fixed.toByteArray(), region.toByteArray(), block.toByteArray(), extensions);

    const nonce = new DataWriter(Endian.Little);
    nonce.writeUInt8(0xa1);
    nonce.writeUInt32(messageId);
    nonce.writeUInt64(fabric.nodeId);
    const ciphertext = Bytes.of(fabric.crypto.encrypt(key, payload, nonce.toByteArray(), header));

    const mic = ciphertext.slice(-16);
    const obfuscated = MessagePrivacy.obfuscate(
        fabric.crypto,
        privacyKey!,
        region.toByteArray(),
        MessagePrivacy.buildNonce(sessionId!, mic),
    );
    return Bytes.concat(fixed.toByteArray(), obfuscated, block.toByteArray(), extensions, ciphertext);
}

/**
 * A plain group header for the session, followed by `payload` unencrypted.  `controlMessage`, `version` and
 * `bothDestinations` change header bits the encoder never sets that way.
 */
export function groupHeaderWith(
    sessionId: number,
    payload: Bytes,
    { controlMessage = false, version = 0, bothDestinations = false } = {},
) {
    const header = Bytes.of(
        MessageCodec.encodePacketHeader({
            sessionId,
            sessionType: SessionType.Group,
            hasPrivacyEnhancements: false,
            isControlMessage: false,
            hasMessageExtensions: false,
            messageId: 0x3000,
            sourceNodeId: NodeId(5),
            destGroupId: 2,
        }),
    );
    if (controlMessage) {
        header[3] |= 0x40;
    }
    header[0] = (header[0] & 0x0f) | (version << 4);
    if (bothDestinations) {
        header[0] |= 0b01;
    }
    return Bytes.concat(header, payload);
}

/** A group datagram that names a destination node instead of a destination group. */
export function groupDatagramToNode(sessionId: number) {
    // The encoder refuses this header, so the destination group id of an encoded header becomes a destination node id
    const header = Bytes.of(groupHeaderWith(sessionId, Bytes.empty)).slice(0, 16);
    header[0] = (header[0] & ~0b11) | 0b01;
    return Bytes.concat(header, new Uint8Array(8), new Uint8Array(32));
}
