/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, MessageCodec } from "#codec/MessageCodec.js";
import { Bytes } from "#general";
import { NodeId } from "#types";

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
