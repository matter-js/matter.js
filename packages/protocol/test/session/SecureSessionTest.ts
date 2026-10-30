/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DecodedPacket, Message, MessageCodec, SessionType } from "#codec/MessageCodec.js";
import { Fabric } from "#fabric/Fabric.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { MessageCounter } from "#protocol/MessageCounter.js";
import type { MessageExchange } from "#protocol/MessageExchange.js";
import { GroupMessageRejection, GroupSession, GroupSessionDecodeError } from "#session/GroupSession.js";
import { NodeSession } from "#session/NodeSession.js";
import { SecureSession } from "#session/SecureSession.js";
import { GroupMessageEventInfo, SessionManager } from "#session/SessionManager.js";
import { MIN_TCP_SPEC_VERSION } from "#session/SessionParameters.js";
import {
    b$,
    Bytes,
    CryptoDecryptError,
    Diagnostic,
    InternalError,
    Key,
    LogFormat,
    Logger,
    LogLevel,
    MemoryStorageDriver,
    PrivateKey,
    StandardCrypto,
    StorageContext,
    UnexpectedDataError,
} from "@matter/general";
import { FabricId, FabricIndex, GlobalFabricId, GroupId, NodeId, VendorId } from "@matter/types";
import { Groupcast } from "@matter/types/clusters/groupcast";
import {
    groupDatagram,
    groupDatagramWithPlaintext,
    privacyGroupDatagramWithExtensions,
    receivedPacket,
    UNPARSABLE_GROUP_PAYLOAD,
} from "./group-datagrams.js";

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

    describe("session parameters", () => {
        it("assumes one path per invoke for a peer that reports zero", () => {
            const session = new NodeSession({
                crypto,
                id: 1,
                fabric: undefined,
                peerNodeId: NodeId.UNSPECIFIED_NODE_ID,
                peerSessionId: 0x8d4b,
                decryptKey: DECRYPT_KEY,
                encryptKey: ENCRYPT_KEY,
                attestationKey: new Uint8Array(),
                isInitiator: true,
                sessionParameters: { maxPathsPerInvoke: 0 },
            });

            expect(session.parameters.maxPathsPerInvoke).equals(1);
        });

        describe("MAX_TCP_MESSAGE_SIZE", () => {
            function tcpSession(maxTcpMessageSize?: number) {
                const sessionParameters = {
                    specificationVersion: MIN_TCP_SPEC_VERSION,
                    supportedTransports: { tcpServer: true },
                    maxTcpMessageSize,
                };
                return captureLogs(
                    () =>
                        new NodeSession({
                            crypto,
                            id: 1,
                            fabric: undefined,
                            peerNodeId: NodeId.UNSPECIFIED_NODE_ID,
                            peerSessionId: 0x8d4b,
                            decryptKey: DECRYPT_KEY,
                            encryptKey: ENCRYPT_KEY,
                            attestationKey: new Uint8Array(),
                            isInitiator: true,
                            sessionParameters,
                            reportedSessionParameters: sessionParameters,
                        }),
                );
            }

            it("logs and uses the default when the peer announces zero", () => {
                const { result: session, logs } = tcpSession(0);

                expect(session.parameters.maxTcpMessageSize).equals(64000);
                const notices = logs.filter(({ message }) => message.includes("MAX_TCP_MESSAGE_SIZE of 0"));
                expect(notices.map(({ level }) => level)).deep.equals([LogLevel.INFO]);
            });

            it("uses the default silently when the peer announces no size", () => {
                const { result: session, logs } = tcpSession(undefined);

                expect(session.parameters.maxTcpMessageSize).equals(64000);
                expect(logs.filter(({ message }) => message.includes("MAX_TCP_MESSAGE_SIZE"))).length(0);
            });
        });
    });

    describe("peer loss", () => {
        it("conveys the initiating exchange to its subscriptions", async () => {
            const session = secureSession();
            const currentExchange = {} as MessageExchange;
            const received = new Array<MessageExchange | undefined>();

            session.subscriptions.add({
                subscriptionId: 1,
                isTerminated: false,
                async handlePeerCancel() {},
                async close(_flushViaSession, exchange) {
                    received.push(exchange);
                },
                async closeForShutdown() {},
            });

            await session.handlePeerLoss({ cause: new Error("unresponsive"), currentExchange });

            // A subscription sending on this exchange must be able to recognize the teardown as its own doing
            expect(received[0]).equals(currentExchange);
        });
    });

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

    describe("AES-CCM limits of a received payload", () => {
        const header = Bytes.of(ENCRYPTED_MESSAGE).slice(0, 8);

        for (const [what, payload, aad, reason] of [
            ["a payload as long as the MIC", 16, 8, undefined],
            ["a payload shorter than the MIC", 15, 8, /shorter than the MIC/],
            // Literals, not the constants, so a wrong constant fails here
            ["the largest payload", 0x1000f, 8, undefined],
            ["a payload one byte too long", 0x10010, 8, /exceeds/],
            ["the largest header", 16, 0xffff, undefined],
            ["a header one byte too long", 16, 0x10000, /header .* exceeds/],
        ] satisfies [string, number, number, RegExp | undefined][]) {
            it(`${reason === undefined ? "accepts" : "refuses"} ${what}`, () => {
                const result = SecureSession.undecryptablePayloadReason(new Uint8Array(payload), new Uint8Array(aad));
                if (reason === undefined) {
                    expect(result).equals(undefined);
                } else {
                    expect(result).match(reason);
                }
            });
        }

        it("refuses a unicast payload over the limit before it decrypts", () => {
            const packet = MessageCodec.decodePacket(Bytes.concat(header, new Uint8Array(0x10010)));
            expect(() => secureSession().decode(packet, header)).throws(UnexpectedDataError, /exceeds/);
        });

        it("passes the largest unicast payload on to decryption", () => {
            const packet = MessageCodec.decodePacket(Bytes.concat(header, new Uint8Array(0x1000f)));
            expect(() => secureSession().decode(packet, header)).throws(CryptoDecryptError);
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

        it("sends a cached group session's messages as the node ID of the current fabric object", async () => {
            const { fabric, fabricManager } = await groupFabric();
            const sessionStorage = new MemoryStorageDriver();
            sessionStorage.initialize();
            const sessions = new SessionManager({
                fabrics: fabricManager,
                storage: new StorageContext(sessionStorage, ["sessions"]),
            });
            await sessions.construction.ready;
            const current = fabric.groups.keySets.currentKeyForId(1);
            const groupId = 2;
            const session = new GroupSession({
                manager: sessions,
                id: current.sessionId ?? 0,
                fabric,
                keySetId: 1,
                operationalGroupKey: current.key,
                operationalPrivacyKey: current.privacyKey,
                peerNodeId: NodeId(0xffffffffffff0000n | BigInt(groupId)),
                multicastAddress: fabric.groups.multicastAddressFor(GroupId(groupId)),
                messageCounter: new MessageCounter(fabric.crypto),
            });

            // As UpdateNOC with a new node ID does
            await fabricManager.replaceFabric(new Fabric(crypto, { ...fabric.config, nodeId: NodeId(2) }));

            expect(session.nodeId).equals(NodeId(2));
            const packet = session.encode({
                packetHeader: {
                    sessionId: current.sessionId ?? 0,
                    sessionType: SessionType.Group,
                    messageId: 0x12345679,
                    destGroupId: groupId,
                    sourceNodeId: NodeId(2),
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
            });
            const wire = MessageCodec.encodePacket(packet);
            const { decodedPacket, aad } = receivedPacket(wire);

            const result = GroupSession.decodeWithCandidateKeys(fabricManager, decodedPacket, aad);

            expect(result.sourceNodeId).equals(NodeId(2));
            expect(Bytes.toHex(result.message.payload)).equals("00112233");
            await sessions.close();
        });

        it("derives the nonce from the source node ID in the header", async () => {
            const { fabric, fabricManager } = await groupFabric();
            const current = fabric.groups.keySets.currentKeyForId(1);
            const session = new GroupSession({
                id: current.sessionId ?? 0,
                fabric,
                keySetId: 1,
                operationalGroupKey: current.key,
                operationalPrivacyKey: current.privacyKey,
                peerNodeId: NodeId(0xffffffffffff0002n),
                multicastAddress: fabric.groups.multicastAddressFor(GroupId(2)),
                messageCounter: new MessageCounter(fabric.crypto),
            });
            const message = (sourceNodeId: NodeId): Message => ({
                packetHeader: {
                    sessionId: current.sessionId ?? 0,
                    sessionType: SessionType.Group,
                    messageId: 0x12345679,
                    destGroupId: 2,
                    sourceNodeId,
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
            });

            const wire = MessageCodec.encodePacket(session.encode(message(NodeId(7))));
            const { decodedPacket, aad } = receivedPacket(wire);

            expect(GroupSession.decodeWithCandidateKeys(fabricManager, decodedPacket, aad).sourceNodeId).equals(
                NodeId(7),
            );
        });

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

            const { decodedPacket, aad } = receivedPacket(wire);
            const result = GroupSession.decodeWithCandidateKeys(fabricManager, decodedPacket, aad);

            expect(Bytes.toHex(result.message.payload)).equals("00112233");
            expect(result.sourceNodeId).equals(fabric.nodeId);
            expect(result.message.packetHeader.destGroupId).equals(groupId);
            expect(result.message.packetHeader.messageId).equals(0x12345679);

            // A key set without a GroupKeyMap link is never tried, so the obfuscated header reveals no group
            fabric.groups.groupKeyIdMap = new Map();
            const failure = decodeFailure(fabricManager, decodedPacket, aad);
            expect(failure.candidateFabrics.size).equals(0);
            expect(failure.group).equals(undefined);
        });

        it("round-trips a group message without privacy and reports the plain header group id", async () => {
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

            const { decodedPacket, aad } = receivedPacket(wire);
            const result = GroupSession.decodeWithCandidateKeys(fabricManager, decodedPacket, aad);

            expect(Bytes.toHex(result.message.payload)).equals("00112233");
            expect(result.message.packetHeader.destGroupId).equals(groupId);

            // A key set without a GroupKeyMap link is never tried; the plain header names the group without a fabric
            fabric.groups.groupKeyIdMap = new Map();
            const failure = decodeFailure(fabricManager, decodedPacket, aad);
            expect(failure.candidateFabrics.size).equals(0);
            expect(failure.group).deep.equals({ groupId: GroupId(groupId) });

            const storage = new MemoryStorageDriver();
            storage.initialize();
            const sessions = new SessionManager({
                fabrics: fabricManager,
                storage: new StorageContext(storage, ["context"]),
            });
            await sessions.construction.ready;
            const emitted = new Array<GroupMessageEventInfo>();
            sessions.onGroupMessage.on(info => {
                emitted.push(info);
            });
            expect(sessions.groupSessionFromPacket(decodedPacket, aad)).equals(undefined);
            expect(emitted).deep.equals([
                {
                    kind: "unauthenticated",
                    candidateFabrics: new Set(),
                    group: { groupId: GroupId(groupId) },
                    sourceIp: undefined,
                },
            ]);
            await sessions.close();
        });
        it("names where it sends, address and port together", async () => {
            const { fabric } = await groupFabric();
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

            expect(session.destination).equal("[ff35:40:fd45:6789:abcd:ef12:3400:2]:5540");
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

        describe("GroupKeyMap check", () => {
            function groupPacket(fabric: Fabric, keySetId: number, groupId: number) {
                return receivedPacket(groupDatagram(fabric, { keySetId, groupId }));
            }

            /** A second fabric with the same identity, so its key set 1 derives the same operational key. */
            async function addTwinFabric(fabric: Fabric, fabricManager: FabricManager) {
                const twin = new Fabric(crypto, {
                    ...fabric.config,
                    fabricIndex: FabricIndex(2),
                    fabricId: FabricId(BigInt("0x456789ABCDEF1235")),
                });
                const twinStorage = new MemoryStorageDriver();
                twinStorage.initialize();
                twin.storage = new StorageContext(twinStorage, ["twin"]);
                fabricManager.addFabric(twin);
                await twin.groups.setFromGroupKeySet({
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
                return twin;
            }

            it("rejects a key whose key set GroupKeyMap maps only to another group", async () => {
                const { fabric, fabricManager } = await groupFabric();
                fabric.groups.groupKeyIdMap = new Map([[GroupId(3), 1]]);
                const { decodedPacket, aad } = groupPacket(fabric, 1, 2);

                const failure = decodeFailure(fabricManager, decodedPacket, aad);

                expect(failure.candidateFabrics).deep.equals(new Set([fabric.fabricIndex]));
                expect(failure.group).deep.equals({ groupId: GroupId(2), fabricIndex: fabric.fabricIndex });
            });

            it("reports a key that GroupKeyMap maps only to another group as failed authentication", async () => {
                const { fabric, fabricManager } = await groupFabric();
                fabric.groups.groupKeyIdMap = new Map([[GroupId(3), 1]]);
                const { decodedPacket, aad } = groupPacket(fabric, 1, 2);
                const storage = new MemoryStorageDriver();
                storage.initialize();
                const sessions = new SessionManager({
                    fabrics: fabricManager,
                    storage: new StorageContext(storage, ["sessions"]),
                });
                await sessions.construction.ready;
                const emitted = new Array<GroupMessageEventInfo>();
                sessions.onGroupMessage.on(info => {
                    emitted.push(info);
                });

                expect(sessions.groupSessionFromPacket(decodedPacket, aad, "fd00::1")).equals(undefined);

                expect(emitted).deep.equals([
                    {
                        kind: "unauthenticated",
                        candidateFabrics: new Set([fabric.fabricIndex]),
                        group: { groupId: GroupId(2), fabricIndex: fabric.fabricIndex },
                        sourceIp: "fd00::1",
                    },
                ]);
                const [event] = emitted;
                if (event.kind === "unauthenticated") {
                    expect(GroupMessageRejection.resultFor(event, fabric.fabricIndex)).equals(
                        Groupcast.GroupcastTestResult.FailedAuth,
                    );
                    expect(GroupMessageRejection.resultFor(event, FabricIndex(2))).equals(
                        Groupcast.GroupcastTestResult.NoAvailableKey,
                    );
                }
                await sessions.close();
            });

            it("names every fabric whose key was a candidate when no key passes", async () => {
                const { fabric, fabricManager } = await groupFabric();
                fabric.groups.groupKeyIdMap = new Map([[GroupId(3), 1]]);
                const twin = await addTwinFabric(fabric, fabricManager);
                twin.groups.groupKeyIdMap = new Map([[GroupId(4), 1]]);
                const { decodedPacket, aad } = groupPacket(fabric, 1, 2);

                const failure = decodeFailure(fabricManager, decodedPacket, aad);

                expect(failure.candidateFabrics).deep.equals(new Set([fabric.fabricIndex, twin.fabricIndex]));
                expect(failure.group).deep.equals({ groupId: GroupId(2), fabricIndex: fabric.fabricIndex });
            });

            it("tries the next candidate after one fails the GroupKeyMap check", async () => {
                const { fabric, fabricManager } = await groupFabric();
                fabric.groups.groupKeyIdMap = new Map([[GroupId(3), 1]]);
                const twin = await addTwinFabric(fabric, fabricManager);
                twin.groups.groupKeyIdMap = new Map([[GroupId(2), 1]]);
                const { decodedPacket, aad } = groupPacket(fabric, 1, 2);

                const result = GroupSession.decodeWithCandidateKeys(fabricManager, decodedPacket, aad);

                expect(result.fabric).equals(twin);
                expect(result.groupId).equals(GroupId(2));
            });

            it("authenticates a privacy message with message extensions", async () => {
                const { fabric, fabricManager } = await groupFabric();
                const payload = MessageCodec.encodePayload({
                    packetHeader: {
                        sessionId: 0,
                        sessionType: SessionType.Group,
                        messageId: 0,
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
                }).applicationPayload;
                const { decodedPacket, aad } = receivedPacket(
                    privacyGroupDatagramWithExtensions(fabric, b$`abcd`, payload),
                );

                const result = GroupSession.decodeWithCandidateKeys(fabricManager, decodedPacket, aad);

                expect(result.groupId).equals(GroupId(2));
                expect(Bytes.toHex(result.message.payload)).equals("00112233");
            });

            it("names a fabric once when several of its keys were candidates", async () => {
                const { fabric, fabricManager } = await groupFabric();
                await fabric.groups.setFromGroupKeySet({
                    groupKeySetId: 2,
                    groupKeySecurityPolicy: 0,
                    epochKey0: b$`000102030405060708090a0b0c0d0e0f`,
                    epochStartTime0: 1,
                    epochKey1: null,
                    epochStartTime1: null,
                    epochKey2: null,
                    epochStartTime2: null,
                    groupKeyMulticastPolicy: 0,
                });
                fabric.groups.groupKeyIdMap = new Map([
                    [GroupId(3), 1],
                    [GroupId(4), 2],
                ]);
                const { decodedPacket, aad } = groupPacket(fabric, 1, 2);

                expect([...decodeFailure(fabricManager, decodedPacket, aad).candidateFabrics]).deep.equals([
                    fabric.fabricIndex,
                ]);
            });

            it("does not name a fabric whose key set is not mapped as a candidate", async () => {
                const { fabric, fabricManager } = await groupFabric();
                fabric.groups.groupKeyIdMap = new Map([[GroupId(3), 1]]);
                const twin = await addTwinFabric(fabric, fabricManager);
                twin.groups.groupKeyIdMap = new Map();
                const { decodedPacket, aad } = groupPacket(fabric, 1, 2);

                const failure = decodeFailure(fabricManager, decodedPacket, aad);

                expect(failure.candidateFabrics).deep.equals(new Set([fabric.fabricIndex]));
            });

            it("fails a mapped key whose authenticated payload does not parse", async () => {
                const { fabric, fabricManager } = await groupFabric();
                const wire = groupDatagramWithPlaintext(fabric, 1, 2, UNPARSABLE_GROUP_PAYLOAD);
                const { decodedPacket, aad } = receivedPacket(wire);

                const failure = decodeFailure(fabricManager, decodedPacket, aad);

                expect(failure.candidateFabrics).deep.equals(new Set([fabric.fabricIndex]));
                expect(failure.group).deep.equals({ groupId: GroupId(2), fabricIndex: fabric.fabricIndex });
            });

            it("fails a key mapped to another group without parsing its payload", async () => {
                const { fabric, fabricManager } = await groupFabric();
                fabric.groups.groupKeyIdMap = new Map([[GroupId(3), 1]]);
                const { decodedPacket, aad } = groupPacket(fabric, 1, 2);
                const { decodePayload } = MessageCodec;
                let parsed = 0;
                MessageCodec.decodePayload = packet => {
                    parsed++;
                    return decodePayload.call(MessageCodec, packet);
                };
                try {
                    expect(decodeFailure(fabricManager, decodedPacket, aad).candidateFabrics).deep.equals(
                        new Set([fabric.fabricIndex]),
                    );
                } finally {
                    MessageCodec.decodePayload = decodePayload;
                }

                expect(parsed).equals(0);
            });

            it("rejects a key whose key set holds other key material than the key set of the destination group", async () => {
                const { fabric, fabricManager } = await groupFabric();
                await fabric.groups.setFromGroupKeySet({
                    groupKeySetId: 2,
                    groupKeySecurityPolicy: 0,
                    epochKey0: b$`f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff`,
                    epochStartTime0: 1,
                    epochKey1: null,
                    epochStartTime1: null,
                    epochKey2: null,
                    epochStartTime2: null,
                    groupKeyMulticastPolicy: 0,
                });
                fabric.groups.groupKeyIdMap = new Map([
                    [GroupId(3), 1],
                    [GroupId(2), 2],
                ]);
                const { decodedPacket, aad } = groupPacket(fabric, 1, 2);

                expect(decodeFailure(fabricManager, decodedPacket, aad).candidateFabrics).deep.equals(
                    new Set([fabric.fabricIndex]),
                );
            });

            it("lets a crypto error other than a failed authentication escape", async () => {
                const { fabric, fabricManager } = await groupFabric();
                const { decodedPacket, aad } = groupPacket(fabric, 1, 2);
                const fabricCrypto = fabric.crypto;
                const { decrypt } = fabricCrypto;
                fabricCrypto.decrypt = () => {
                    throw new InternalError("Test failure while decrypting a group payload");
                };
                try {
                    expect(() => GroupSession.decodeWithCandidateKeys(fabricManager, decodedPacket, aad)).throws(
                        InternalError,
                    );
                } finally {
                    fabricCrypto.decrypt = decrypt;
                }
            });

            it("names the plain header group id without a fabric when no key authenticates", async () => {
                const { fabric, fabricManager } = await groupFabric();
                const wire = groupDatagramWithPlaintext(fabric, 1, 2, UNPARSABLE_GROUP_PAYLOAD);
                fabric.groups.removeGroupKeySet(1);
                const { decodedPacket, aad } = receivedPacket(wire);

                const failure = decodeFailure(fabricManager, decodedPacket, aad);

                expect(failure.candidateFabrics.size).equals(0);
                expect(failure.group).deep.equals({ groupId: GroupId(2) });
            });

            it("lets an error other than a parse failure of the payload escape", async () => {
                const { fabric, fabricManager } = await groupFabric();
                const { decodedPacket, aad } = groupPacket(fabric, 1, 2);
                const { decodePayload } = MessageCodec;
                MessageCodec.decodePayload = () => {
                    throw new InternalError("Test failure while parsing a group payload");
                };
                try {
                    expect(() => GroupSession.decodeWithCandidateKeys(fabricManager, decodedPacket, aad)).throws(
                        InternalError,
                    );
                } finally {
                    MessageCodec.decodePayload = decodePayload;
                }
            });

            it("accepts a key whose key set GroupKeyMap maps the destination group to", async () => {
                const { fabric, fabricManager } = await groupFabric();
                fabric.groups.groupKeyIdMap = new Map([
                    [GroupId(3), 1],
                    [GroupId(2), 1],
                ]);
                const { decodedPacket, aad } = groupPacket(fabric, 1, 2);

                const result = GroupSession.decodeWithCandidateKeys(fabricManager, decodedPacket, aad);

                expect(result.groupId).equals(GroupId(2));
                expect(result.keySetId).equals(1);
                expect(Bytes.toHex(result.message.payload)).equals("00112233");
            });

            it("accepts a key that the destination group's key set holds although its own key set maps another group", async () => {
                const { fabric, fabricManager } = await groupFabric();
                // Identical key material derives the same group session id for both key sets
                await fabric.groups.setFromGroupKeySet({
                    groupKeySetId: 2,
                    groupKeySecurityPolicy: 0,
                    epochKey0: b$`000102030405060708090a0b0c0d0e0f`,
                    epochStartTime0: 1,
                    epochKey1: null,
                    epochStartTime1: null,
                    epochKey2: null,
                    epochStartTime2: null,
                    groupKeyMulticastPolicy: 0,
                });
                const current = fabric.groups.keySets.currentKeyForId(1);
                expect(fabric.groups.sessions.get(current.sessionId!)?.map(({ keySetId }) => keySetId)).deep.equals([
                    1, 2,
                ]);
                fabric.groups.groupKeyIdMap = new Map([
                    [GroupId(3), 1],
                    [GroupId(2), 2],
                ]);
                const { decodedPacket, aad } = groupPacket(fabric, 1, 2);

                const result = GroupSession.decodeWithCandidateKeys(fabricManager, decodedPacket, aad);

                expect(result.groupId).equals(GroupId(2));
                expect(Bytes.areEqual(result.key, current.key)).equals(true);
                // Access control checks the same mapping by key material
                expect(fabric.groups.subjectForGroup(GroupId(2), result.key)).deep.include({ hasValidMapping: true });
            });
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

function captureLogs<T>(fn: () => T) {
    const dest = Logger.destinations.default;
    const { format, write } = dest;
    const logs = new Array<{ level: LogLevel; message: string }>();
    try {
        dest.format = LogFormat.formats.plain;
        dest.write = (message: string, { level }: Diagnostic.Message) => {
            logs.push({ level, message });
        };
        return { result: fn(), logs };
    } finally {
        dest.format = format;
        dest.write = write;
    }
}

function decodeFailure(fabrics: FabricManager, packet: DecodedPacket, aad: Bytes) {
    try {
        GroupSession.decodeWithCandidateKeys(fabrics, packet, aad);
    } catch (error) {
        GroupSessionDecodeError.accept(error);
        return error;
    }
    throw new InternalError("Decode accepted the group message");
}
