/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, MessageCodec, SessionType } from "#codec/MessageCodec.js";
import { b$, Bytes, StandardCrypto } from "#general";
import { NodeSession } from "#session/NodeSession.js";
import { NodeId } from "#types";

const ENCRYPT_KEY = b$`66951379d0a6d151cf5472cccf13f360`;
const DECRYPT_KEY = b$`bacb178b2588443d5d5b1e4559e7accc`;
const ENCRYPTED_MESSAGE = b$`001d350022145300ec2b931025dada82ed67521c966d2454d131a271023be699e4e2796650f568e590fd9b65f456c720a60a0da127eaa53974c5d41d3d933ed7b58a9ce5b5cb96ad94a7762611c48774cf75458327e74c34668a45dc9943546f8a6aa1dcd40bd4b8014befb49954a097a60cbdff333ee3f2fd1f49`;
const ENCRYPTED_BYTES = b$`1f9c4e278a2e2a755ebb4fcb9478211efb09aa9518fcafb56d74f135544636037c16fb6b62347794da0c5bde142e1a8b1cc96575e9e55471c08b58f7640b7d7f4173c8ff967c39e9961f30a29cb1f64f68df4b5bc1e742587f778eeb9ec586c162ff384558596792a2c1e43c150cd0e9ec1484c50950f17cd6c084d07caed94ce45c20004210cbde48da44ebcf7d931657f03e07e3ea29ae41868b804bf39e628323cd025507773f07268301aa1e77a82927fce041241839cee4114f6307b6befe3befde87a2d3f13eeef96b27b36e788d907b44bef2d195aa802692f4f12acc015aede3cd29da272d1e4b7f3f59683d25bf08f0e29fba2a8a9b`;
const DECRYPTED_BYTES = b$`153600172403312504fcff18172402002403302404001817240200240330240401181724020024033024040218172402002403302404031817240200240328240402181724020024032824040418172403312404031818290324ff0118`;

const MESSAGE: Message = {
    packetHeader: {
        messageId: 12519906,
        sessionId: 0x351d,
        sessionType: SessionType.Unicast,
        hasPrivacyEnhancements: false,
        isControlMessage: false,
        hasMessageExtensions: false,
    },
    payloadHeader: {
        isInitiatorMessage: false,
        requiresAck: true,
        messageType: 0x05,
        exchangeId: 0x048d,
        protocolId: 0x0001,
        ackedMessageId: 0x00531422,
        hasSecuredExtension: false,
    },
    payload: b$`1536011535012600799ac60c37012402002403312404031824021418181535012600b771f32f3701240200240328240404182502018018181535012600b771f32f3701240200240328240402182502f1ff18181535012600ddad82d637012402002403302404031824020218181535012600ddad82d637012402002403302404021824020018181535012600ddad82d6370124020024033024040118350224003c1818181535012600ddad82d637012402002403302404001824020018181535012600799ac60c37012402002403312504fcff18240201181818290424ff0118`,
};

describe("SecureSession", () => {
    const crypto = new StandardCrypto();

    function secureSession() {
        return new NodeSession({
            crypto,
            id: 1,
            fabric: undefined,
            peerNodeId: NodeId.UNSPECIFIED_NODE_ID,
            peerSessionId: 0x8d4b,
            decryptKey: DECRYPT_KEY,
            encryptKey: ENCRYPT_KEY,
            attestationKey: new Uint8Array(),
            isInitiator: true,
        });
    }

    describe("decrypt", () => {
        it("decrypts a message", () => {
            const packet = MessageCodec.decodePacket(ENCRYPTED_MESSAGE);

            const aad = Bytes.of(ENCRYPTED_MESSAGE).slice(
                0,
                ENCRYPTED_MESSAGE.byteLength - packet.applicationPayload.byteLength,
            );
            const result = secureSession().decode(packet, aad);
            expect(Bytes.toHex(result.payload)).to.equal(Bytes.toHex(DECRYPTED_BYTES));
        });
    });

    describe("encrypt", () => {
        it("encrypts a message", () => {
            const result = secureSession().encode(MESSAGE);

            expect(Bytes.toHex(result.applicationPayload)).to.deep.equal(Bytes.toHex(ENCRYPTED_BYTES));
        });
    });
});
