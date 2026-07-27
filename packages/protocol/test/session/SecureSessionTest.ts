/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, MessageCodec, SessionType } from "#codec/MessageCodec.js";
import { Fabric } from "#fabric/Fabric.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { MessageCounter } from "#protocol/MessageCounter.js";
import { GroupSession, GroupSessionNoKeyError } from "#session/GroupSession.js";
import { NodeSession } from "#session/NodeSession.js";
import { b$, Bytes, Key, MemoryStorageDriver, PrivateKey, StandardCrypto, StorageContext } from "@matter/general";
import { FabricId, FabricIndex, GlobalFabricId, GroupId, NodeId, VendorId } from "@matter/types";

const TEST_ROOT_PUBLIC_KEY = Bytes.fromHex(
    "044a9f42b1ca4840d37292bbc7f6a7e11e22200c976fc900dbc98a7a383a641cb8254a2e56d4e295a847943b4e3897c4a773e930277b4d9fbede8a052686bfacfa",
);
const TEST_IDENTITY_PROTECTION_KEY = Bytes.fromHex("9bc61cd9c62a2df6d64dfcaa9dc472d4");
const SEC1_KEY = Bytes.fromHex(
    "30770201010420aef3484116e9481ec57be0472df41bf499064e5024ad869eca5e889802d48075a00a06082a8648ce3d030107a144034200043c398922452b55caf389c25bd1bca4656952ccb90e8869249ad8474653014cbf95d687965e036b521c51037e6b8cedefca1eb44046694fa08882eed6519decba",
);

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

    describe("group privacy", () => {
        async function groupFabric() {
            const crypto = new StandardCrypto();
            const fabric = new Fabric(crypto, {
                fabricIndex: FabricIndex(1),
                fabricId: FabricId(BigInt("0x456789ABCDEF1234")),
                nodeId: NodeId(1),
                rootNodeId: NodeId(1),
                globalId: GlobalFabricId(0),
                keyPair: Key({ sec1: SEC1_KEY }) as PrivateKey,
                rootPublicKey: TEST_ROOT_PUBLIC_KEY,
                rootVendorId: VendorId(0),
                rootCert: new Uint8Array(),
                identityProtectionKey: new Uint8Array(),
                operationalIdentityProtectionKey: TEST_IDENTITY_PROTECTION_KEY,
                intermediateCACert: new Uint8Array(),
                operationalCert: new Uint8Array(),
                label: "",
            });

            const storage = new MemoryStorageDriver();
            storage.initialize();
            fabric.storage = new StorageContext(storage, ["fabric"]);

            const fabricManager = new FabricManager(crypto);
            await fabricManager.construction.ready;
            fabricManager.addFabric(fabric);

            await fabric.groups.setFromGroupKeySet({
                groupKeySetId: 1,
                groupKeySecurityPolicy: 0,
                epochKey0: b$`000102030405060708090a0b0c0d0e0f`,
                epochStartTime0: 1,
                epochKey1: null,
                epochStartTime1: null,
                epochKey2: null,
                epochStartTime2: null,
                groupKeyMulticastPolicy: 0,
            });

            // Decryption only considers keys of mapped key sets
            fabric.groups.groupKeyIdMap = new Map([[GroupId(2), 1]]);

            return { fabric, fabricManager };
        }

        it("round-trips a group message with privacy enabled", async () => {
            const { fabric, fabricManager } = await groupFabric();
            const current = fabric.groups.keySets.currentKeyForId(1);
            const groupId = 2;
            const session = new GroupSession({
                id: current.sessionId!,
                fabric,
                keySetId: 1,
                operationalGroupKey: current.key,
                operationalPrivacyKey: current.privacyKey,
                peerNodeId: NodeId(0xffffffffffff0000n | BigInt(groupId)),
                multicastAddress: fabric.groups.multicastAddressFor(GroupId(groupId)),
                messageCounter: new MessageCounter(fabric.crypto),
            });

            const message: Message = {
                packetHeader: {
                    sessionId: current.sessionId!,
                    sessionType: SessionType.Group,
                    messageId: 0x12345679,
                    destGroupId: groupId,
                    sourceNodeId: fabric.nodeId,
                    hasPrivacyEnhancements: true,
                    isControlMessage: false,
                    hasMessageExtensions: false,
                },
                payloadHeader: {
                    isInitiatorMessage: true,
                    requiresAck: false,
                    messageType: 0x05,
                    exchangeId: 0x1234,
                    protocolId: 0x0001,
                    ackedMessageId: undefined,
                    hasSecuredExtension: false,
                },
                payload: b$`00112233`,
            };

            const packet = session.encode(message);
            const wire = MessageCodec.encodePacket(packet);

            expect(Bytes.of(wire)[3] & 0x80).equals(0x80);

            const decodedPacket = MessageCodec.decodePacket(wire);
            const aad = Bytes.of(wire).slice(0, wire.byteLength - decodedPacket.applicationPayload.byteLength);
            const result = GroupSession.decode(fabricManager, decodedPacket, aad);

            expect(Bytes.toHex(result.message.payload)).equals("00112233");
            expect(result.sourceNodeId).equals(fabric.nodeId);
            expect(result.message.packetHeader.destGroupId).equals(groupId);
            expect(result.message.packetHeader.messageId).equals(0x12345679);

            // A key set without a GroupKeyMap link is not usable for decryption, but since the message
            // authenticated, the group id is reported for Groupcast testing
            fabric.groups.groupKeyIdMap = new Map();
            let noKeyError: unknown;
            try {
                GroupSession.decode(fabricManager, decodedPacket, aad);
            } catch (error) {
                noKeyError = error;
            }
            expect(noKeyError).instanceOf(GroupSessionNoKeyError);
            if (noKeyError instanceof GroupSessionNoKeyError) {
                expect(noKeyError.groupId).equals(groupId);
            }
        });

        it("round-trips a group message without privacy and reports the unmapped group id", async () => {
            const { fabric, fabricManager } = await groupFabric();
            const current = fabric.groups.keySets.currentKeyForId(1);
            const groupId = 2;
            const session = new GroupSession({
                id: current.sessionId!,
                fabric,
                keySetId: 1,
                operationalGroupKey: current.key,
                operationalPrivacyKey: current.privacyKey,
                peerNodeId: NodeId(0xffffffffffff0000n | BigInt(groupId)),
                multicastAddress: fabric.groups.multicastAddressFor(GroupId(groupId)),
                messageCounter: new MessageCounter(fabric.crypto),
            });

            const message: Message = {
                packetHeader: {
                    sessionId: current.sessionId!,
                    sessionType: SessionType.Group,
                    messageId: 0x1234567a,
                    destGroupId: groupId,
                    sourceNodeId: fabric.nodeId,
                    hasPrivacyEnhancements: false,
                    isControlMessage: false,
                    hasMessageExtensions: false,
                },
                payloadHeader: {
                    isInitiatorMessage: true,
                    requiresAck: false,
                    messageType: 0x05,
                    exchangeId: 0x1234,
                    protocolId: 0x0001,
                    ackedMessageId: undefined,
                    hasSecuredExtension: false,
                },
                payload: b$`00112233`,
            };

            const packet = session.encode(message);
            const wire = MessageCodec.encodePacket(packet);

            // No privacy flag on the wire
            expect(Bytes.of(wire)[3] & 0x80).equals(0);

            const decodedPacket = MessageCodec.decodePacket(wire);
            const aad = Bytes.of(wire).slice(0, wire.byteLength - decodedPacket.applicationPayload.byteLength);
            const result = GroupSession.decode(fabricManager, decodedPacket, aad);

            expect(Bytes.toHex(result.message.payload)).equals("00112233");
            expect(result.message.packetHeader.destGroupId).equals(groupId);

            // Unmapped key set reports the group id from the plain header as well
            fabric.groups.groupKeyIdMap = new Map();
            let noKeyError: unknown;
            try {
                GroupSession.decode(fabricManager, decodedPacket, aad);
            } catch (error) {
                noKeyError = error;
            }
            expect(noKeyError).instanceOf(GroupSessionNoKeyError);
            if (noKeyError instanceof GroupSessionNoKeyError) {
                expect(noKeyError.groupId).equals(groupId);
            }
        });

        it("matches a cached session by fabric, session id and operational key, not by id alone", async () => {
            const { fabric } = await groupFabric();
            const current = fabric.groups.keySets.currentKeyForId(1);
            const session = new GroupSession({
                id: current.sessionId!,
                fabric,
                keySetId: 1,
                operationalGroupKey: current.key,
                operationalPrivacyKey: current.privacyKey,
                peerNodeId: NodeId(0xffffffffffff0002n),
                multicastAddress: fabric.groups.multicastAddressFor(GroupId(2)),
                messageCounter: new MessageCounter(fabric.crypto),
            });

            expect(session.matches(fabric.fabricIndex, current.sessionId!, Bytes.of(current.key))).equals(true);

            // Same session id but a different operational key (a hash collision) must not match — this is the stale-key
            // guard: reusing this session would evaluate the message against the wrong key for ACL.
            expect(
                session.matches(fabric.fabricIndex, current.sessionId!, b$`ffffffffffffffffffffffffffffffff`),
            ).equals(false);
            expect(session.matches(FabricIndex(99), current.sessionId!, Bytes.of(current.key))).equals(false);
            expect(session.matches(fabric.fabricIndex, current.sessionId! ^ 0x1, Bytes.of(current.key))).equals(false);
        });

        it("always sends group messages with the privacy flag set", async () => {
            const { fabric } = await groupFabric();
            const current = fabric.groups.keySets.currentKeyForId(1);
            const session = new GroupSession({
                id: current.sessionId!,
                fabric,
                keySetId: 1,
                operationalGroupKey: current.key,
                operationalPrivacyKey: current.privacyKey,
                peerNodeId: NodeId(0xffffffffffff0002n),
                multicastAddress: fabric.groups.multicastAddressFor(GroupId(2)),
                messageCounter: new MessageCounter(fabric.crypto),
            });

            expect(session.usePrivacy).equals(true);
        });
    });
});
