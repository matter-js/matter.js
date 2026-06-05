/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, MessageCodec } from "#codec/MessageCodec.js";
import { Bytes } from "@matter/general";
import { NodeId } from "@matter/types";

const ENCODED = Bytes.fromHex(
    "040000000a4ff2177ea0c8a7cb6a63520520d3640000153001204715a406c6b0496ad52039e347db8528cb69a1cb2fce6f2318552ae65e103aca250233dc240300280435052501881325022c011818",
);

const ENCODED_WITH_PRIVACY_EXTENSION = Bytes.fromHex(
    "040000200a4ff2177ea0c8a7cb6a635203000102030520d3640000153001204715a406c6b0496ad52039e347db8528cb69a1cb2fce6f2318552ae65e103aca250233dc240300280435052501881325022c011818",
);

const ENCODED_WITH_SECURED_EXTENSION = Bytes.fromHex(
    "040000000a4ff2177ea0c8a7cb6a63520d20d36400000300010203153001204715a406c6b0496ad52039e347db8528cb69a1cb2fce6f2318552ae65e103aca250233dc240300280435052501881325022c011818",
);

const DECODED = {
    packetHeader: {
        sessionId: 0,
        sessionType: 0,
        sourceNodeId: NodeId(BigInt("5936706156730294398")),
        messageId: 401755914,
        destGroupId: undefined,
        destNodeId: undefined,
        hasPrivacyEnhancements: false,
        isControlMessage: false,
        hasMessageExtensions: false,
        securityFlags: 0,
    },
    payloadHeader: {
        protocolId: 0,
        isInitiatorMessage: true,
        exchangeId: 25811,
        messageType: 0x20,
        requiresAck: true,
        ackedMessageId: undefined,
        hasSecuredExtension: false,
    },
    payload: Bytes.fromHex(
        "153001204715a406c6b0496ad52039e347db8528cb69a1cb2fce6f2318552ae65e103aca250233dc240300280435052501881325022c011818",
    ),
    securityExtension: undefined,
};

const ENCODED_2 = Bytes.fromHex(
    "01000000218712797ea0c8a7cb6a63520621d36400000a4ff217153001204715a406c6b0496ad52039e347db8528cb69a1cb2fce6f2318552ae65e103aca3002201783302d95a4a9fb0decb8fdd6564b90a957681459aeee069961bea61d7b247125039d8935042501e80330022099f813dd41bd081a1c63e811828f0662594bca89cd9d4ed26f7427fdb2a027361835052501881325022c011818",
);

const DECODED_2 = {
    packetHeader: {
        sessionId: 0,
        sessionType: 0,
        sourceNodeId: undefined,
        messageId: 2031257377,
        destGroupId: undefined,
        destNodeId: NodeId(BigInt("5936706156730294398")),
        hasPrivacyEnhancements: false,
        isControlMessage: false,
        hasMessageExtensions: false,
        securityFlags: 0,
    },
    payloadHeader: {
        protocolId: 0,
        isInitiatorMessage: false,
        exchangeId: 25811,
        messageType: 0x21,
        requiresAck: true,
        ackedMessageId: 401755914,
        hasSecuredExtension: false,
    },
    payload: Bytes.fromHex(
        "153001204715a406c6b0496ad52039e347db8528cb69a1cb2fce6f2318552ae65e103aca3002201783302d95a4a9fb0decb8fdd6564b90a957681459aeee069961bea61d7b247125039d8935042501e80330022099f813dd41bd081a1c63e811828f0662594bca89cd9d4ed26f7427fdb2a027361835052501881325022c011818",
    ),
    securityExtension: undefined,
};

describe("MessageCodec", () => {
    describe("decode", () => {
        it("decodes a message", () => {
            const result = MessageCodec.decodePayload(MessageCodec.decodePacket(ENCODED));

            expect(result).deep.equal(DECODED);
        });

        it("decodes a message 2", () => {
            const result = MessageCodec.decodePayload(MessageCodec.decodePacket(ENCODED_2));

            expect(result).deep.equal(DECODED_2);
        });

        it("decodes message with message extension", () => {
            const result = MessageCodec.decodePacket(ENCODED_WITH_PRIVACY_EXTENSION);

            expect(result).deep.equal({
                header: {
                    ...DECODED.packetHeader,
                    hasMessageExtensions: true,
                    securityFlags: 0x20,
                },
                applicationPayload: Bytes.of(ENCODED).slice(16),
                messageExtension: Bytes.fromHex("010203"),
            });
        });

        it("rejects message extension length exceeding remaining bytes", () => {
            // Same as ENCODED_WITH_PRIVACY_EXTENSION but extension length field set to 0xffff
            const malformed = Bytes.of(ENCODED_WITH_PRIVACY_EXTENSION).slice();
            malformed[16] = 0xff;
            malformed[17] = 0xff;

            expect(() => MessageCodec.decodePacket(malformed)).throws(
                /Message extension length \d+ exceeds remaining message size \d+\./,
            );
        });

        it("decodes message with secured extension", () => {
            const result = MessageCodec.decodePayload(MessageCodec.decodePacket(ENCODED_WITH_SECURED_EXTENSION));

            const DECODED_WITH_SECURED_EXTENSION = {
                ...DECODED,
                payloadHeader: {
                    ...DECODED.payloadHeader,
                    hasSecuredExtension: true,
                },
                securityExtension: Bytes.fromHex("010203"),
            };

            expect(result).deep.equal(DECODED_WITH_SECURED_EXTENSION);
        });

        it("rejects secured extension length exceeding remaining bytes", () => {
            // Same as ENCODED_WITH_SECURED_EXTENSION but extension length field set to 0xffff
            const malformed = Bytes.of(ENCODED_WITH_SECURED_EXTENSION).slice();
            malformed[22] = 0xff;
            malformed[23] = 0xff;

            expect(() => MessageCodec.decodePayload(MessageCodec.decodePacket(malformed))).throws(
                /Secured extension length \d+ exceeds remaining message size \d+\./,
            );
        });

        it("decodes the cleartext prefix of a privacy-enhanced group packet (CHIP vector)", () => {
            // "private group message" vector from CHIP TestSessionManagerDispatch.cpp
            const wire = Bytes.fromHex(
                "067ddb81d926afce24c8a0981bdd44f4e7302b2f915a66c9596290ebe4408217b3c0c921a2fca4e1",
            );
            const packet = MessageCodec.decodePacket(wire);

            expect(packet.header.hasPrivacyEnhancements).equals(true);
            expect(packet.header.sessionId).equals(0xdb7d);
            expect(packet.header.securityFlags).equals(0x81);
            expect(packet.header.sessionType).equals(1); // group
            // Obfuscated fields are not yet decoded:
            expect(packet.header.messageId).equals(0);
            expect(packet.header.sourceNodeId).equals(undefined);
            expect(packet.header.destGroupId).equals(undefined);
            // The obfuscated region is exposed for the session to deobfuscate (4 + 8 + 2 = 14 bytes):
            expect(Bytes.toHex(packet.privacyHeader!)).equals("d926afce24c8a0981bdd44f4e730");
            // Application payload = ciphertext + MIC (6 + 16 = 22 bytes):
            expect(packet.applicationPayload.byteLength).equals(22);
        });

        it("decodes obfuscated header fields once deobfuscated", () => {
            const messageFlags = 0x06; // version 0, source node id + dest group id present
            const region = Bytes.fromHex("7956341201000000000000000200");
            const fields = MessageCodec.decodeObfuscatedHeaderFields(messageFlags, region);
            expect(fields.messageId).equals(0x12345679);
            expect(fields.sourceNodeId).equals(NodeId(1n));
            expect(fields.destNodeId).equals(undefined);
            expect(fields.destGroupId).equals(2);
        });
    });

    describe("encode privacy", () => {
        it("sets the privacy bit in the encoded packet header", () => {
            const headerBytes = MessageCodec.encodePacketHeader({
                sessionId: 0xdb7d,
                sessionType: 1, // group
                messageId: 0x12345679,
                destGroupId: 2,
                sourceNodeId: NodeId(1n),
                hasPrivacyEnhancements: true,
                isControlMessage: false,
                hasMessageExtensions: false,
            });
            // security flags byte (index 3) = group (0x01) | privacy (0x80) = 0x81
            expect(Bytes.of(headerBytes)[3]).equals(0x81);
        });

        it("encodePacket uses pre-serialized headerBytes when present", () => {
            const headerBytes = Bytes.fromHex("067ddb81d926afce24c8a0981bdd44f4e730");
            const applicationPayload = Bytes.fromHex("2b2f915a66c9596290ebe44082177b3c0c921a2fca4e10");
            const result = MessageCodec.encodePacket({
                header: {
                    sessionId: 0xdb7d,
                    sessionType: 1,
                    messageId: 0x12345679,
                    destGroupId: 2,
                    sourceNodeId: NodeId(1n),
                    hasPrivacyEnhancements: true,
                    isControlMessage: false,
                    hasMessageExtensions: false,
                },
                headerBytes,
                applicationPayload,
            });
            expect(Bytes.toHex(result)).equals(Bytes.toHex(Bytes.concat(headerBytes, applicationPayload)));
        });
    });

    describe("encode", () => {
        it("encodes a message", () => {
            const result = MessageCodec.encodePacket(MessageCodec.encodePayload(DECODED));

            expect(result).deep.equal(ENCODED);
        });

        it("encodes a message 2", () => {
            const result = MessageCodec.encodePacket(MessageCodec.encodePayload(DECODED_2));

            expect(result).deep.equal(ENCODED_2);
        });

        it("throws when encoding a message with securityExtensions data", () => {
            expect(() =>
                MessageCodec.encodePayload({
                    ...DECODED,
                    securityExtension: Bytes.fromHex("0102030405060708090a0b0c0d0e0f10"),
                }),
            ).throws("Security extensions not supported when encoding a payload.");
        });

        it("throws when encoding a message with securityExtensions flag", () => {
            const decoded = {
                ...DECODED,
            } as Message;
            decoded.payloadHeader = { ...decoded.payloadHeader }; // make copy to not change original value
            decoded.payloadHeader.hasSecuredExtension = true;
            expect(() => MessageCodec.encodePayload(decoded)).throws(
                "Security extensions not supported when encoding a payload.",
            );
        });

        it("throws when encoding a message with messageExtension data", () => {
            expect(() =>
                MessageCodec.encodePacket({
                    ...MessageCodec.encodePayload(DECODED),
                    messageExtension: Bytes.fromHex("0102030405060708090a0b0c0d0e0f10"),
                }),
            ).throws("Message extensions not supported when encoding a packet.");
        });

        it("throws when encoding a message with messageExtension flag", () => {
            const payload = {
                ...MessageCodec.encodePayload(DECODED),
            };
            payload.header = { ...payload.header }; // make copy to not change original value
            payload.header.hasMessageExtensions = true;

            expect(() => MessageCodec.encodePacket(payload)).throws(
                "Message extensions not supported when encoding a packet.",
            );
        });
    });
});
