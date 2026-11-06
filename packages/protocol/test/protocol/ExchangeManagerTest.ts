/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, MessageCodec, SessionType, UNICAST_UNSECURE_SESSION_ID } from "#codec/MessageCodec.js";
import { Fabric } from "#fabric/Fabric.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { ExchangeIdsExhaustedError } from "#protocol/errors.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import type { MessageExchange } from "#protocol/MessageExchange.js";
import type { ProtocolHandler } from "#protocol/ProtocolHandler.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { GroupMessageRejection, GroupSession } from "#session/GroupSession.js";
import { NodeSession } from "#session/NodeSession.js";
import { GroupMessageEventInfo, SessionManager, ShutdownError } from "#session/SessionManager.js";
import {
    Bytes,
    Channel,
    ChannelType,
    ClosedError,
    UdpNetworkChannel,
    Environment,
    InternalError,
    Key,
    Logger,
    LogLevel,
    MemoryStorageDriver,
    MockCrypto,
    NetworkError,
    Observable,
    PrivateKey,
    StandardCrypto,
    StorageContext,
    Transport,
    TransportSet,
    UdpSocket,
    UdpTransport,
} from "@matter/general";
import {
    FabricId,
    FabricIndex,
    GlobalFabricId,
    GroupId,
    NodeId,
    SECURE_CHANNEL_PROTOCOL_ID,
    SecureMessageType,
    VendorId,
} from "@matter/types";
import { Groupcast } from "@matter/types/clusters/groupcast";
import {
    GroupDatagramOptions,
    groupDatagram,
    groupDatagramToNode,
    groupDatagramWithPlaintext,
    groupHeaderWith,
    receivedPacket,
    UNPARSABLE_GROUP_PAYLOAD,
} from "../session/group-datagrams.js";

/** A UDP-like transport that delivers datagrams on demand. */
class MockTransport implements Transport {
    readonly #listeners = new Set<(socket: Channel<Bytes>, data: Bytes) => void>();
    readonly channel: UdpNetworkChannel<Bytes> = {
        maxPayloadSize: 1280,
        isReliable: false,
        supportsLargeMessages: false,
        name: "mock-udp",
        type: ChannelType.UDP,
        networkAddress: { type: "udp", ip: "fd00::1", port: 5540 },
        networkAddressChanged: Observable(),
        async send() {},
        async close() {},
    };

    onData(listener: (socket: Channel<Bytes>, data: Bytes) => void): Transport.Listener {
        this.#listeners.add(listener);
        return {
            close: async () => {
                this.#listeners.delete(listener);
            },
        };
    }

    supports(type: ChannelType) {
        return type === ChannelType.UDP;
    }

    async openChannel(): Promise<Channel<Bytes>> {
        return this.channel;
    }

    async close() {}

    receive(data: Bytes) {
        for (const listener of this.#listeners) {
            listener(this.channel, data);
        }
    }
}

describe("ExchangeManager", () => {
    before(() => MockTime.init());

    /** A manager whose sole session fails every send, with a subscription recording its own teardown. */
    async function failingPeer(options?: { suppressPeerLoss?: boolean }) {
        const environment = new Environment("test");
        const storage = new MemoryStorageDriver();
        storage.initialize();

        const crypto = new StandardCrypto();
        const sessions = new SessionManager({
            fabrics: new FabricManager(crypto),
            storage: new StorageContext(storage, ["context"]),
        });
        await sessions.construction.ready;

        const exchanges = new ExchangeManager({
            lifetime: environment,
            entropy: crypto,
            transports: new TransportSet(),
            sessions,
        });

        const session = new ProtocolMocks.NodeSession({ manager: sessions, ...options });
        (session.channel as any).send = async (_message: Message): Promise<void> => {
            throw new NetworkError("Simulated network failure");
        };

        const closedWith = new Array<MessageExchange | undefined>();
        session.subscriptions.add({
            subscriptionId: 1,
            isTerminated: false,
            async handlePeerCancel() {},
            async close(_flushViaSession, exchange) {
                closedWith.push(exchange);
            },
            async closeForShutdown() {},
        });

        // Peer loss ignores sessions created no earlier than the failing exchange
        await MockTime.advance(1000);

        return {
            session,
            closedWith,
            exchanges,
            async [Symbol.asyncDispose]() {
                await exchanges.close();
                await sessions.close();
            },
        };
    }

    describe("peer loss", () => {
        it("conveys the failing exchange so its own subscription does not wait on itself", async () => {
            await using peer = await failingPeer();

            const exchange = peer.exchanges.initiateExchangeForSession(peer.session, SECURE_CHANNEL_PROTOCOL_ID);
            await expect(exchange.send(0, Bytes.empty)).to.be.rejectedWith(NetworkError);

            expect(peer.closedWith[0]).equals(exchange);
        });

        it("leaves the session and its subscriptions alone when the exchange suppresses peer loss", async () => {
            await using peer = await failingPeer();

            const exchange = peer.exchanges.initiateExchangeForSession(peer.session, SECURE_CHANNEL_PROTOCOL_ID, {
                suppressPeerLoss: true,
            });
            await expect(exchange.send(0, Bytes.empty)).to.be.rejectedWith(NetworkError);

            expect(peer.closedWith).is.empty;
            expect(peer.session.isClosing).is.false;
            expect(peer.session.isPeerLost).is.false;
        });

        it("leaves a session alone that suppresses peer loss", async () => {
            await using peer = await failingPeer({ suppressPeerLoss: true });

            const exchange = peer.exchanges.initiateExchangeForSession(peer.session, SECURE_CHANNEL_PROTOCOL_ID);
            await expect(exchange.send(0, Bytes.empty)).to.be.rejectedWith(NetworkError);

            expect(peer.closedWith).is.empty;
            expect(peer.session.isClosing).is.false;
            expect(peer.session.isPeerLost).is.false;
        });

        it("reports the session lost when the clock stepped back since the session was created", async () => {
            await using peer = await failingPeer();
            MockTime.stepWallClock(-3_600_000);

            const exchange = peer.exchanges.initiateExchangeForSession(peer.session, SECURE_CHANNEL_PROTOCOL_ID);
            await expect(exchange.send(0, Bytes.empty)).to.be.rejectedWith(NetworkError);

            expect(peer.closedWith[0]).equals(exchange);
        });
    });

    describe("inbound group messages", () => {
        const SEC1_KEY = Bytes.fromHex(
            "30770201010420aef3484116e9481ec57be0472df41bf499064e5024ad869eca5e889802d48075a00a06082a8648ce3d030107a144034200043c398922452b55caf389c25bd1bca4656952ccb90e8869249ad8474653014cbf95d687965e036b521c51037e6b8cedefca31c50e75db4b7e942e5aae4c4f3f71",
        );
        const ROOT_PUBLIC_KEY = Bytes.fromHex(
            "044a9f42b1ca4840d37292bbc7f6a7e11e22200c976fc900dbc98a7a383a641cb8254a2e56d4e295a847943b4e3897c4a773e930277b4d9fbede8a052686bfacfa",
        );
        const IPK = Bytes.fromHex("0c677d9b5ac585827b577470bd9bd516");

        /** A fabric with one mapped group key set, and the manager plumbing to receive on it. */
        async function groupReceiver() {
            const environment = new Environment("test");
            const crypto = new StandardCrypto();
            const fabric = new Fabric(crypto, {
                fabricIndex: FabricIndex(1),
                fabricId: FabricId(BigInt("0x456789ABCDEF1234")),
                nodeId: NodeId(1),
                rootNodeId: NodeId(1),
                globalId: GlobalFabricId(0),
                keyPair: Key({ sec1: SEC1_KEY }) as PrivateKey,
                rootPublicKey: ROOT_PUBLIC_KEY,
                rootVendorId: VendorId(0),
                rootCert: new Uint8Array(),
                identityProtectionKey: new Uint8Array(),
                operationalIdentityProtectionKey: IPK,
                intermediateCACert: new Uint8Array(),
                operationalCert: new Uint8Array(),
                label: "",
            });

            const storage = new MemoryStorageDriver();
            storage.initialize();
            fabric.storage = new StorageContext(storage, ["fabric"]);

            const fabrics = new FabricManager(crypto);
            await fabrics.construction.ready;
            fabrics.addFabric(fabric);

            await fabric.groups.setFromGroupKeySet({
                groupKeySetId: 1,
                groupKeySecurityPolicy: 0,
                epochKey0: Bytes.fromHex("000102030405060708090a0b0c0d0e0f"),
                epochStartTime0: 1,
                epochKey1: null,
                epochStartTime1: null,
                epochKey2: null,
                epochStartTime2: null,
                groupKeyMulticastPolicy: 0,
            });
            fabric.groups.groupKeyIdMap = new Map([[GroupId(2), 1]]);

            const sessions = new SessionManager({
                fabrics,
                storage: new StorageContext(storage, ["context"]),
            });
            await sessions.construction.ready;

            const transports = new TransportSet();
            const exchanges = new ExchangeManager({
                lifetime: environment,
                entropy: crypto,
                transports,
                sessions,
            });
            const transport = new MockTransport();
            transports.add(transport);

            return {
                fabric,
                fabrics,
                sessions,
                exchanges,
                transport,
                async [Symbol.asyncDispose]() {
                    await exchanges.close();
                    await sessions.close();
                },
            };
        }

        /** An ICD check-in datagram for group 2 of the fabric, which the secure channel handler of a test accepts. */
        function checkInDatagram(fabric: Fabric, options: GroupDatagramOptions = {}) {
            return groupDatagram(fabric, {
                protocolId: SECURE_CHANNEL_PROTOCOL_ID,
                messageType: SecureMessageType.IcdCheckInMessage,
                payload: Bytes.empty,
                ...options,
            });
        }

        /** Records the message each new exchange was opened for. */
        function recordingHandler(messages: Message[]): ProtocolHandler {
            return {
                id: SECURE_CHANNEL_PROTOCOL_ID,
                requiresSecureSession: true,
                async onNewExchange(exchange: MessageExchange) {
                    messages.push(await exchange.nextMessage());
                    await exchange.close();
                },
                async close() {},
            };
        }

        async function settle() {
            for (let i = 0; i < 20; i++) {
                await MockTime.yield();
            }
        }

        it("gives each message the address of its own datagram", async () => {
            await using peer = await groupReceiver();
            const messages = new Array<Message>();
            peer.exchanges.addProtocolHandler(recordingHandler(messages));

            // One group session serves every datagram of this source node and key set
            for (const [index, ip] of ["fd00::1", "fd00::2"].entries()) {
                peer.transport.channel.networkAddress = { ...peer.transport.channel.networkAddress, ip };

                peer.transport.receive(checkInDatagram(peer.fabric, { messageId: 0x1000 + index }));
                await settle();
            }

            expect(messages.map(message => message.receivedFrom)).deep.equals(["fd00::1", "fd00::2"]);
        });

        /** Receives `copies` copies of `datagram`, see {@link receiveDatagrams}. */
        function receiveCopies(peer: Awaited<ReturnType<typeof groupReceiver>>, datagram: Bytes, copies: number) {
            return receiveDatagrams(peer, new Array<Bytes>(copies).fill(datagram));
        }

        /**
         * Receives the datagrams in order and records what reaches a protocol handler, the Groupcast testing results and
         * the levels of all log messages.
         */
        async function receiveDatagrams(peer: Awaited<ReturnType<typeof groupReceiver>>, datagrams: Bytes[]) {
            const messages = new Array<Message>();
            peer.exchanges.addProtocolHandler(recordingHandler(messages));
            const results = new Array<GroupMessageEventInfo>();
            peer.sessions.onGroupMessage.on(info => {
                results.push(info);
            });
            const { levels } = await captureLevels(async () => {
                for (const datagram of datagrams) {
                    peer.transport.receive(datagram);
                    await settle();
                }
            });
            return { messages, results, levels };
        }

        /** The Groupcast testing result each event gives for the fabric. */
        function testResults(events: GroupMessageEventInfo[], fabric: Fabric) {
            return events.map(event =>
                event.kind === "authenticated"
                    ? event.result
                    : GroupMessageRejection.resultFor(event, fabric.fabricIndex),
            );
        }

        it("fails every copy of a message whose key set GroupKeyMap maps only to another group", async () => {
            await using peer = await groupReceiver();
            peer.fabric.groups.groupKeyIdMap = new Map([[GroupId(3), 1]]);

            const { messages, results, levels } = await receiveCopies(
                peer,
                checkInDatagram(peer.fabric, { messageId: 0x2000 }),
                3,
            );

            // The counter is not committed for a failed message, so copies are never reported as a replay
            expect(testResults(results, peer.fabric)).deep.equals([
                Groupcast.GroupcastTestResult.FailedAuth,
                Groupcast.GroupcastTestResult.FailedAuth,
                Groupcast.GroupcastTestResult.FailedAuth,
            ]);
            expect(results.map(({ kind }) => kind)).deep.equals([
                "unauthenticated",
                "unauthenticated",
                "unauthenticated",
            ]);
            expect(messages).length(0);
            // A peer can send these repeatedly, so they must not log above debug
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
        });

        it("fails every copy of a message whose authenticated payload does not parse", async () => {
            await using peer = await groupReceiver();
            const datagram = groupDatagramWithPlaintext(peer.fabric, 1, 2, UNPARSABLE_GROUP_PAYLOAD);

            const { messages, results, levels } = await receiveCopies(peer, datagram, 3);

            expect(testResults(results, peer.fabric)).deep.equals([
                Groupcast.GroupcastTestResult.FailedAuth,
                Groupcast.GroupcastTestResult.FailedAuth,
                Groupcast.GroupcastTestResult.FailedAuth,
            ]);
            expect(messages).length(0);
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
        });

        it("drops a message without a mapped key set and logs nothing above debug", async () => {
            await using peer = await groupReceiver();
            peer.fabric.groups.groupKeyIdMap = new Map();

            const { messages, results, levels } = await receiveCopies(
                peer,
                checkInDatagram(peer.fabric, { messageId: 0x2000 }),
                2,
            );

            expect(testResults(results, peer.fabric)).deep.equals([
                Groupcast.GroupcastTestResult.NoAvailableKey,
                Groupcast.GroupcastTestResult.NoAvailableKey,
            ]);
            expect(messages).length(0);
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
        });

        /** Counts the decode attempts of group messages while `fn` runs. */
        async function countingDecodes<T>(fn: () => Promise<T>) {
            const { decodeWithCandidateKeys } = GroupSession;
            let decodes = 0;
            GroupSession.decodeWithCandidateKeys = (...args) => {
                decodes++;
                return decodeWithCandidateKeys.apply(GroupSession, args);
            };
            try {
                const result = await fn();
                return { ...result, decodes };
            } finally {
                GroupSession.decodeWithCandidateKeys = decodeWithCandidateKeys;
            }
        }

        type GroupReceiver = Awaited<ReturnType<typeof groupReceiver>>;
        const sessionIdOf = (peer: GroupReceiver) => peer.fabric.groups.keySets.currentKeyForId(1).sessionId!;

        const malformedGroupDatagrams: [string, (peer: GroupReceiver) => Bytes][] = [
            ["a group message without destination group id", peer => groupDatagramToNode(sessionIdOf(peer))],
            [
                "a group control message",
                peer => groupHeaderWith(sessionIdOf(peer), new Uint8Array(32), { controlMessage: true }),
            ],
            [
                "a group message with an unsupported header version",
                peer => groupHeaderWith(sessionIdOf(peer), new Uint8Array(32), { version: 1 }),
            ],
            [
                "a group message with both destination flags",
                peer => groupHeaderWith(sessionIdOf(peer), new Uint8Array(32), { bothDestinations: true }),
            ],
        ];
        for (const [what, datagram] of malformedGroupDatagrams) {
            it(`drops ${what} unreported before trying any key`, async () => {
                await using peer = await groupReceiver();

                const { messages, results, levels, decodes } = await countingDecodes(() =>
                    receiveCopies(peer, datagram(peer), 1),
                );

                expect(decodes).equals(0);
                expect(results).length(0);
                expect(messages).length(0);
                expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
            });
        }

        it("reports a plain group message with a payload shorter than the MIC as failed authentication", async () => {
            await using peer = await groupReceiver();

            const { messages, results, levels, decodes } = await countingDecodes(() =>
                receiveCopies(peer, groupHeaderWith(sessionIdOf(peer), new Uint8Array(15)), 1),
            );

            expect(decodes).equals(1);
            expect(testResults(results, peer.fabric)).deep.equals([Groupcast.GroupcastTestResult.FailedAuth]);
            expect(messages).length(0);
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
        });

        it("reports a privacy group message with a payload shorter than the MIC as failed authentication", async () => {
            await using peer = await groupReceiver();
            // The fixed header and the obfuscated region with source node id and group id take 18 bytes
            const datagram = Bytes.of(checkInDatagram(peer.fabric)).slice(0, 18 + 15);

            const { messages, results, levels, decodes } = await countingDecodes(() =>
                receiveCopies(peer, datagram, 1),
            );

            expect(decodes).equals(1);
            expect(testResults(results, peer.fabric)).deep.equals([Groupcast.GroupcastTestResult.FailedAuth]);
            expect(messages).length(0);
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
        });

        it("reports a group message with a payload longer than AES-CCM allows as failed authentication", async () => {
            await using peer = await groupReceiver();

            const { results, levels } = await receiveCopies(
                peer,
                groupHeaderWith(sessionIdOf(peer), new Uint8Array(0x10010)),
                1,
            );

            expect(testResults(results, peer.fabric)).deep.equals([Groupcast.GroupcastTestResult.FailedAuth]);
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
        });

        it("drops a group message for an unsupported protocol at debug level", async () => {
            await using peer = await groupReceiver();

            const { messages, levels } = await receiveCopies(
                peer,
                checkInDatagram(peer.fabric, { protocolId: 0x7777, isInitiatorMessage: false }),
                1,
            );

            expect(messages).length(0);
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
        });

        it("reports a short group message on session id 0 as without key", async () => {
            await using peer = await groupReceiver();

            const { results, levels } = await receiveCopies(peer, groupHeaderWith(0, new Uint8Array(4)), 1);

            expect(testResults(results, peer.fabric)).deep.equals([Groupcast.GroupcastTestResult.NoAvailableKey]);
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
        });

        it("tries the keys of a privacy group message with message extensions", async () => {
            await using peer = await groupReceiver();
            // Insert an empty extension block after the obfuscated region and announce it; the MIC no longer matches
            const sent = Bytes.of(checkInDatagram(peer.fabric));
            const datagram = Bytes.of(Bytes.concat(sent.slice(0, 18), Bytes.fromHex("0000"), sent.slice(18)));
            datagram[3] |= 0x20;

            const { results, decodes, levels } = await countingDecodes(() => receiveCopies(peer, datagram, 1));

            expect(decodes).equals(1);
            expect(testResults(results, peer.fabric)).deep.equals([Groupcast.GroupcastTestResult.FailedAuth]);
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
        });

        it("tries the keys of a group message whose payload is as long as the MIC", async () => {
            await using peer = await groupReceiver();

            const fabricCrypto = peer.fabric.crypto;
            const { decrypt } = fabricCrypto;
            let decrypts = 0;
            fabricCrypto.decrypt = (...args) => {
                decrypts++;
                return decrypt.apply(fabricCrypto, args);
            };
            try {
                const { results } = await receiveCopies(
                    peer,
                    groupHeaderWith(sessionIdOf(peer), new Uint8Array(16)),
                    1,
                );

                expect(decrypts).equals(1);
                expect(testResults(results, peer.fabric)).deep.equals([Groupcast.GroupcastTestResult.FailedAuth]);
            } finally {
                fabricCrypto.decrypt = decrypt;
            }
        });

        it("counts the exchange limit of a unicast session without group exchanges of the same session id", async () => {
            await using peer = await groupReceiver();
            const unicast = await unicastSessionOf(peer);
            const unicastExchanges = new Array<MessageExchange>();
            for (let i = 0; i < 30; i++) {
                unicastExchanges.push(peer.exchanges.initiateExchangeForSession(unicast, SECURE_CHANNEL_PROTOCOL_ID));
            }

            const { messages } = await receiveCopies(peer, checkInDatagram(peer.fabric, { exchangeId: 0x7000 }), 1);

            expect(messages).length(1);
            expect(unicastExchanges.filter(exchange => exchange.considerClosed)).length(0);
            for (const exchange of unicastExchanges) {
                await exchange.close();
            }
        });

        /** A unicast session whose id equals the group session id of the receiver. */
        function unicastSessionOf(peer: GroupReceiver) {
            return peer.sessions.createSecureSession({
                id: sessionIdOf(peer),
                fabric: peer.fabric,
                peerNodeId: NodeId(0x20),
                peerSessionId: 0x300,
                isInitiator: true,
                sharedSecret: Bytes.of(new Uint8Array(32)),
                salt: Bytes.empty,
                isResumption: false,
            });
        }

        it("closes the least recently active exchange once a unicast session exceeds its exchange limit", async () => {
            await using peer = await groupReceiver();
            const unicast = await unicastSessionOf(peer);
            const exchanges = new Array<MessageExchange>();
            const { entries } = await captureLevels(async () => {
                for (let i = 0; i < 31; i++) {
                    exchanges.push(peer.exchanges.initiateExchangeForSession(unicast, SECURE_CHANNEL_PROTOCOL_ID));
                    await MockTime.advance(1);
                }
            });

            expect(exchanges.map(exchange => exchange.considerClosed === true)).deep.equals([
                true,
                ...new Array<boolean>(30).fill(false),
            ]);
            // A peer can cause the eviction repeatedly, so it logs at debug only
            expect(
                entries.filter(({ text }) => text.includes("least-recently-active")).map(({ level }) => level),
            ).deep.equals([LogLevel.DEBUG]);
            for (const exchange of exchanges) {
                await exchange.close();
            }
        });

        it("does not count a closing exchange toward the exchange limit", async () => {
            await using peer = await groupReceiver();
            const unicast = await unicastSessionOf(peer);
            const exchanges = new Array<MessageExchange>();
            for (let i = 0; i < 30; i++) {
                exchanges.push(peer.exchanges.initiateExchangeForSession(unicast, SECURE_CHANNEL_PROTOCOL_ID));
            }
            const closing = exchanges[29].close();

            exchanges.push(peer.exchanges.initiateExchangeForSession(unicast, SECURE_CHANNEL_PROTOCOL_ID));

            expect(exchanges.slice(0, 29).filter(exchange => exchange.considerClosed)).length(0);
            await closing;
            for (const exchange of exchanges) {
                await exchange.close();
            }
        });

        it("keeps replay state per source node", async () => {
            await using peer = await groupReceiver();

            const { messages, results } = await receiveDatagrams(peer, [
                checkInDatagram(peer.fabric, { messageId: 0x2000, sourceNodeId: NodeId(0x10) }),
                checkInDatagram(peer.fabric, { messageId: 0x2000, sourceNodeId: NodeId(0x11) }),
                checkInDatagram(peer.fabric, { messageId: 0x2000, sourceNodeId: NodeId(0x10) }),
            ]);

            expect(messages.map(({ packetHeader }) => packetHeader.sourceNodeId)).deep.equals([
                NodeId(0x10),
                NodeId(0x11),
            ]);
            expect(testResults(results, peer.fabric)).deep.equals([Groupcast.GroupcastTestResult.MessageReplay]);
        });

        it("does not deliver a group message to a unicast exchange with the same session and exchange id", async () => {
            await using peer = await groupReceiver();
            const groupSessionId = peer.fabric.groups.keySets.currentKeyForId(1).sessionId!;
            const unicast = await peer.sessions.createSecureSession({
                id: groupSessionId,
                fabric: peer.fabric,
                peerNodeId: NodeId(0x20),
                peerSessionId: 0x300,
                isInitiator: true,
                sharedSecret: Bytes.of(new Uint8Array(32)),
                salt: Bytes.empty,
                isResumption: false,
            });
            const exchange = peer.exchanges.initiateExchangeForSession(unicast, SECURE_CHANNEL_PROTOCOL_ID);
            let delivered = 0;
            exchange.onMessageReceived = async () => {
                delivered++;
            };

            await receiveCopies(
                peer,
                checkInDatagram(peer.fabric, { isInitiatorMessage: false, exchangeId: exchange.id }),
                1,
            );

            expect(delivered).equals(0);
            await exchange.close();
        });

        it("reports a replayed group message with its group", async () => {
            await using peer = await groupReceiver();

            const { messages, results } = await receiveCopies(
                peer,
                checkInDatagram(peer.fabric, { messageId: 0x2000 }),
                2,
            );

            expect(messages).length(1);
            expect(
                results.map(event =>
                    event.kind === "authenticated" ? { result: event.result, groupId: event.groupId } : event,
                ),
            ).deep.equals([{ result: Groupcast.GroupcastTestResult.MessageReplay, groupId: GroupId(2) }]);
        });

        /** Counts the group sessions the session manager creates for received messages. */
        function countCreatedGroupSessions(peer: GroupReceiver) {
            const created = { count: 0 };
            const register = peer.sessions.registerGroupSession.bind(peer.sessions);
            peer.sessions.registerGroupSession = session => {
                created.count++;
                register(session);
            };
            return created;
        }

        for (const [flag, flags] of [
            ["R", { requiresAck: true }],
            ["A", { ackedMessageId: 0x1000 }],
        ] satisfies [string, { requiresAck?: boolean; ackedMessageId?: number }][]) {
            it(`drops a group data message with the ${flag} flag before it creates a session`, async () => {
                await using peer = await groupReceiver();
                const created = countCreatedGroupSessions(peer);

                const { messages, results, levels } = await receiveDatagrams(peer, [
                    checkInDatagram(peer.fabric, { messageId: 0x2000, ...flags }),
                ]);

                expect(messages).length(0);
                expect(results).length(0);
                expect(created.count).equals(0);
                expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
            });

            it(`does not commit the counter of a group data message with the ${flag} flag`, async () => {
                await using peer = await groupReceiver();

                // The same counter without the flag is no replay
                const { messages, results } = await receiveDatagrams(peer, [
                    checkInDatagram(peer.fabric, { messageId: 0x2000, ...flags }),
                    checkInDatagram(peer.fabric, { messageId: 0x2000 }),
                ]);

                expect(messages.map(({ payloadHeader }) => payloadHeader.ackedMessageId)).deep.equals([undefined]);
                expect(results).length(0);
            });
        }

        it("lets an error other than a malformed datagram reach the error log", async () => {
            await using peer = await groupReceiver();
            const { decodePacket } = MessageCodec;
            MessageCodec.decodePacket = () => {
                throw new InternalError("Test failure while decoding a datagram");
            };
            try {
                const { levels } = await receiveCopies(peer, checkInDatagram(peer.fabric), 1);

                expect(levels.filter(level => level === LogLevel.ERROR)).length(1);
            } finally {
                MessageCodec.decodePacket = decodePacket;
            }
        });

        it("lets other errors of a group message reach the error log", async () => {
            await using peer = await groupReceiver();
            peer.sessions.groupSessionFromPacket = () => {
                throw new InternalError("Test failure while receiving a group message");
            };

            const { messages, levels } = await receiveCopies(
                peer,
                checkInDatagram(peer.fabric, { messageId: 0x2000 }),
                1,
            );

            expect(messages).length(0);
            expect(levels.filter(level => level === LogLevel.ERROR)).length(1);
        });

        it("lets an error other than a parse failure of a group payload reach the error log", async () => {
            await using peer = await groupReceiver();
            const { decodePayload } = MessageCodec;
            MessageCodec.decodePayload = () => {
                throw new InternalError("Test failure while parsing a group payload");
            };
            try {
                const { messages, results, levels } = await receiveCopies(
                    peer,
                    checkInDatagram(peer.fabric, { messageId: 0x2000 }),
                    1,
                );

                expect(messages).length(0);
                expect(results).length(0);
                expect(levels.filter(level => level === LogLevel.ERROR)).length(1);
            } finally {
                MessageCodec.decodePayload = decodePayload;
            }
        });

        it("sends as the current node ID through an exchange opened before the fabric's node ID changed", async () => {
            await using peer = await groupReceiver();
            const sent = new Array<Bytes>();
            peer.transport.channel.send = async (data: Bytes) => {
                sent.push(data);
            };
            const session = await peer.sessions.groupSessionForAddress(
                peer.fabric.addressOf(NodeId.fromGroupId(GroupId(2))),
                peer.exchanges,
            );
            const exchange = peer.exchanges.initiateExchangeForSession(session, SECURE_CHANNEL_PROTOCOL_ID);

            // As UpdateNOC with a new node ID does
            await peer.fabrics.replaceFabric(
                new Fabric(peer.fabric.crypto, { ...peer.fabric.config, nodeId: NodeId(2) }),
            );
            await exchange.send(SecureMessageType.IcdCheckInMessage, Bytes.empty);
            await exchange.close();

            expect(sent).length(1);
            const { decodedPacket, aad } = receivedPacket(sent[0]);
            expect(GroupSession.decodeWithCandidateKeys(peer.fabrics, decodedPacket, aad).sourceNodeId).equals(
                NodeId(2),
            );
        });
    });

    describe("inbound secure messages", () => {
        const PEER = NodeId(1);

        /** A manager holding a CASE session with {@link PEER}, a sleeping registered LIT peer, and the peer's side. */
        async function sessionWithSleepingLitPeer() {
            const environment = new Environment("test");
            const crypto = MockCrypto();
            const storage = new MemoryStorageDriver();
            storage.initialize();

            const fabric = new ProtocolMocks.Fabric({}, crypto);
            fabric.icd.addPeer(
                { peerNodeId: PEER, key: Bytes.of(new Uint8Array(16)), counterStart: 0, lastOffset: 0 },
                () => {},
            );
            const wakefulness = fabric.icd.wakefulnessFor(PEER);
            if (wakefulness === undefined) {
                throw new InternalError("LIT peer not registered");
            }
            wakefulness.requiresAwait = true;

            const sessions = new SessionManager({
                fabrics: new FabricManager(crypto),
                storage: new StorageContext(storage, ["context"]),
            });
            await sessions.construction.ready;
            const keys = { sharedSecret: Bytes.of(new Uint8Array(32)), salt: Bytes.empty, isResumption: false };
            const session = await sessions.createSecureSession({
                id: 100,
                fabric,
                peerNodeId: PEER,
                peerSessionId: 200,
                isInitiator: false,
                ...keys,
            });
            const peerSession = await NodeSession.create({
                crypto,
                id: 200,
                fabric: new ProtocolMocks.Fabric({ nodeId: PEER }, crypto),
                peerNodeId: fabric.nodeId,
                peerSessionId: 100,
                isInitiator: true,
                ...keys,
            });

            const transports = new TransportSet();
            const exchanges = new ExchangeManager({ lifetime: environment, entropy: crypto, transports, sessions });
            const transport = new MockTransport();
            transports.add(transport);

            return {
                session,
                sessions,
                fabric,
                wakefulness,
                exchanges,
                transport,
                /** A datagram the peer sends on its session. */
                datagram(message: Pick<Message, "payloadHeader">, messageId = 1) {
                    return MessageCodec.encodePacket(
                        peerSession.encode({
                            packetHeader: {
                                sessionId: 100,
                                sessionType: SessionType.Unicast,
                                messageId,
                                isControlMessage: false,
                                hasMessageExtensions: false,
                                hasPrivacyEnhancements: false,
                            },
                            payload: Bytes.empty,
                            ...message,
                        }),
                    );
                },
                async [Symbol.asyncDispose]() {
                    wakefulness.close();
                    await exchanges.close();
                    await sessions.close();
                },
            };
        }

        /** A unicast datagram on the given session whose payload follows the header as given. */
        function unicastDatagramWith(payload: Bytes, { messageExtensions = false, sessionId = 100 } = {}) {
            const header = Bytes.of(
                MessageCodec.encodePacketHeader({
                    sessionId,
                    sessionType: SessionType.Unicast,
                    messageId: 1,
                    isControlMessage: false,
                    hasMessageExtensions: false,
                    hasPrivacyEnhancements: false,
                }),
            );
            if (messageExtensions) {
                header[3] |= 0x20;
            }
            return Bytes.concat(header, payload);
        }

        for (const [what, datagram, above] of [
            ["a payload shorter than the MIC", unicastDatagramWith(new Uint8Array(15)), []],
            [
                "message extensions that leave less than the MIC",
                unicastDatagramWith(Bytes.concat(Bytes.fromHex("0200abcd"), new Uint8Array(15)), {
                    messageExtensions: true,
                }),
                [],
            ],
            // The first authentication failure of a session is also reported once at notice level
            ["a payload that does not authenticate", unicastDatagramWith(new Uint8Array(32)), [LogLevel.NOTICE]],
            ["a payload longer than AES-CCM allows", unicastDatagramWith(new Uint8Array(0x10010)), []],
            [
                "a header longer than AES-CCM allows",
                unicastDatagramWith(Bytes.concat(Bytes.fromHex("ffff"), new Uint8Array(0xffff), new Uint8Array(32)), {
                    messageExtensions: true,
                }),
                [],
            ],
        ] satisfies [string, Bytes, LogLevel[]][]) {
            it(`drops a secured unicast message with ${what} at debug level`, async () => {
                await using peer = await sessionWithSleepingLitPeer();
                const received = new Array<MessageExchange>();
                peer.exchanges.addProtocolHandler({
                    id: SECURE_CHANNEL_PROTOCOL_ID,
                    requiresSecureSession: true,
                    async onNewExchange(exchange) {
                        received.push(exchange);
                    },
                    async close() {},
                });

                const { levels } = await captureLevels(async () => {
                    peer.transport.receive(datagram);
                    for (let i = 0; i < 20; i++) {
                        await MockTime.yield();
                    }
                });

                expect(received).length(0);
                expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals(above);
            });
        }

        /** A message the peer sends in reply on the exchange `exchangeId` that this node started. */
        function responseOn(exchangeId: number): Pick<Message, "payloadHeader"> {
            return {
                payloadHeader: {
                    isInitiatorMessage: false,
                    requiresAck: false,
                    messageType: SecureMessageType.IcdCheckInMessage,
                    exchangeId,
                    protocolId: SECURE_CHANNEL_PROTOCOL_ID,
                    ackedMessageId: undefined,
                    hasSecuredExtension: false,
                },
            };
        }

        it("delivers a response to the exchange this node started", async () => {
            await using peer = await sessionWithSleepingLitPeer();
            const ours = peer.exchanges.initiateExchangeForSession(peer.session, SECURE_CHANNEL_PROTOCOL_ID);
            const received = ours.nextMessage();

            peer.transport.receive(peer.datagram(responseOn(ours.id)));

            expect((await received).payloadHeader.exchangeId).equals(ours.id);
            await ours.close();
        });

        it("drops a response for an exchange that is not open at debug level", async () => {
            await using peer = await sessionWithSleepingLitPeer();
            peer.exchanges.addProtocolHandler({
                id: SECURE_CHANNEL_PROTOCOL_ID,
                requiresSecureSession: true,
                async onNewExchange() {},
                async close() {},
            });

            const { levels, entries } = await captureLevels(async () => {
                peer.transport.receive(peer.datagram(responseOn(0x4321)));
                for (let i = 0; i < 20; i++) {
                    await MockTime.yield();
                }
            });

            expect(entries.filter(({ text }) => text.includes("unexpected message"))).length(1);
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
        });

        it("closes the least recently active exchange after an older exchange became active again", async () => {
            await using peer = await sessionWithSleepingLitPeer();
            const exchanges = new Array<MessageExchange>();
            for (let i = 0; i < 30; i++) {
                exchanges.push(peer.exchanges.initiateExchangeForSession(peer.session, SECURE_CHANNEL_PROTOCOL_ID));
                await MockTime.advance(1);
            }
            const received = exchanges[0].nextMessage();
            peer.transport.receive(peer.datagram(responseOn(exchanges[0].id)));
            await received;

            exchanges.push(peer.exchanges.initiateExchangeForSession(peer.session, SECURE_CHANNEL_PROTOCOL_ID));

            expect(exchanges.map(exchange => exchange.considerClosed === true)).deep.equals([
                false,
                true,
                ...new Array<boolean>(29).fill(false),
            ]);
            for (const exchange of exchanges) {
                await exchange.close();
            }
        });

        it("reports messages that fail authentication once per session at notice level", async () => {
            await using peer = await sessionWithSleepingLitPeer();
            await peer.sessions.createSecureSession({
                id: 101,
                fabric: peer.fabric,
                peerNodeId: NodeId(2),
                peerSessionId: 201,
                isInitiator: false,
                sharedSecret: Bytes.of(new Uint8Array(32)),
                salt: Bytes.empty,
                isResumption: false,
            });

            const { entries } = await captureLevels(async () => {
                for (const sessionId of [100, 100, 101]) {
                    peer.transport.receive(unicastDatagramWith(new Uint8Array(32), { sessionId }));
                    for (let i = 0; i < 20; i++) {
                        await MockTime.yield();
                    }
                }
            });

            const failures = entries.filter(({ text }) => text.includes("does not decode"));
            expect(failures.map(({ level }) => level)).deep.equals([LogLevel.DEBUG, LogLevel.DEBUG, LogLevel.DEBUG]);
            const notices = entries.filter(({ level }) => level === LogLevel.NOTICE);
            expect(notices).length(2);
            expect(notices.every(({ text }) => text.includes("fails authentication"))).equals(true);
            expect(entries.filter(({ level }) => level > LogLevel.NOTICE)).deep.equals([]);
        });

        it("drops a message for an unknown session at debug level", async () => {
            await using peer = await sessionWithSleepingLitPeer();
            const header = MessageCodec.encodePacketHeader({
                sessionId: 999,
                sessionType: SessionType.Unicast,
                messageId: 1,
                isControlMessage: false,
                hasMessageExtensions: false,
                hasPrivacyEnhancements: false,
            });

            const { levels } = await captureLevels(async () => {
                peer.transport.receive(Bytes.concat(header, new Uint8Array(32)));
                for (let i = 0; i < 20; i++) {
                    await MockTime.yield();
                }
            });

            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
        });

        it("drops a unicast message for an unsupported protocol at debug level", async () => {
            await using peer = await sessionWithSleepingLitPeer();
            const datagram = peer.datagram({
                payloadHeader: {
                    isInitiatorMessage: false,
                    requiresAck: false,
                    messageType: 0x01,
                    exchangeId: 0x1234,
                    protocolId: 0x7777,
                    ackedMessageId: undefined,
                    hasSecuredExtension: false,
                },
            });

            const { levels } = await captureLevels(async () => {
                peer.transport.receive(datagram);
                for (let i = 0; i < 20; i++) {
                    await MockTime.yield();
                }
            });

            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
        });

        it("counts a duplicate message as peer activity", async () => {
            await using peer = await sessionWithSleepingLitPeer();
            peer.exchanges.addProtocolHandler({
                id: SECURE_CHANNEL_PROTOCOL_ID,
                requiresSecureSession: true,
                async onNewExchange() {},
                async close() {},
            });
            const ack = peer.datagram({
                payloadHeader: {
                    isInitiatorMessage: false,
                    requiresAck: false,
                    messageType: SecureMessageType.StandaloneAck,
                    exchangeId: 0x1234,
                    protocolId: SECURE_CHANNEL_PROTOCOL_ID,
                    ackedMessageId: 0x5678,
                    hasSecuredExtension: false,
                },
            });
            peer.transport.receive(ack);
            for (let i = 0; i < 20; i++) {
                await MockTime.yield();
            }
            const first = peer.session.activeTimestamp;

            await MockTime.advance(1000);
            peer.transport.receive(ack);
            for (let i = 0; i < 20; i++) {
                await MockTime.yield();
            }

            expect(peer.session.activeTimestamp).greaterThan(first);
        });

        it("wakes a sleeping LIT peer on a message no exchange accepts", async () => {
            await using peer = await sessionWithSleepingLitPeer();
            peer.exchanges.addProtocolHandler({
                id: SECURE_CHANNEL_PROTOCOL_ID,
                requiresSecureSession: true,
                async onNewExchange() {},
                async close() {},
            });

            peer.transport.receive(
                peer.datagram({
                    payloadHeader: {
                        isInitiatorMessage: false,
                        requiresAck: false,
                        messageType: SecureMessageType.StandaloneAck,
                        exchangeId: 0x1234,
                        protocolId: SECURE_CHANNEL_PROTOCOL_ID,
                        ackedMessageId: 0x5678,
                        hasSecuredExtension: false,
                    },
                }),
            );
            for (let i = 0; i < 20; i++) {
                await MockTime.yield();
            }

            expect(peer.wakefulness.awake.value).equal(true);
            expect(peer.wakefulness.available.value).equal(true);
        });
    });

    describe("inbound unsecured sessions", () => {
        /** A manager receiving on a transport we can feed datagrams into. */
        async function receiver() {
            const environment = new Environment("test");
            const storage = new MemoryStorageDriver();
            storage.initialize();

            const crypto = new StandardCrypto();
            const sessions = new SessionManager({
                fabrics: new FabricManager(crypto),
                storage: new StorageContext(storage, ["context"]),
            });
            await sessions.construction.ready;

            const transports = new TransportSet();
            const exchanges = new ExchangeManager({
                lifetime: environment,
                entropy: crypto,
                transports,
                sessions,
            });

            const transport = new MockTransport();
            transports.add(transport);

            return {
                sessions,
                exchanges,
                transport,
                async [Symbol.asyncDispose]() {
                    await exchanges.close();
                    await sessions.close();
                },
            };
        }

        /** Handles the first message like an ICD check-in: no response, exchange closed. */
        function silentHandler(): ProtocolHandler {
            return {
                id: SECURE_CHANNEL_PROTOCOL_ID,
                requiresSecureSession: false,
                async onNewExchange(exchange: MessageExchange) {
                    await exchange.close();
                },
                async close() {},
            };
        }

        function unsecuredMessage(sourceNodeId: NodeId, messageId: number, requiresAck = false, exchangeId = 1) {
            return MessageCodec.encodePacket(
                MessageCodec.encodePayload({
                    packetHeader: {
                        sessionId: UNICAST_UNSECURE_SESSION_ID,
                        sessionType: SessionType.Unicast,
                        hasPrivacyEnhancements: false,
                        isControlMessage: false,
                        hasMessageExtensions: false,
                        messageId,
                        sourceNodeId,
                    },
                    payloadHeader: {
                        exchangeId,
                        protocolId: SECURE_CHANNEL_PROTOCOL_ID,
                        messageType: SecureMessageType.IcdCheckInMessage,
                        isInitiatorMessage: true,
                        requiresAck,
                        hasSecuredExtension: false,
                    },
                    payload: Bytes.empty,
                }),
            );
        }

        /** Message processing runs as a background worker with more await hops than a single yield covers */
        async function settle() {
            for (let i = 0; i < 20; i++) {
                await MockTime.yield();
            }
        }

        it("discards the session when the handler does not adopt it", async () => {
            await using peer = await receiver();
            peer.exchanges.addProtocolHandler(silentHandler());

            for (let i = 0; i < 3; i++) {
                peer.transport.receive(unsecuredMessage(NodeId(BigInt(i + 1)), i + 1));
                await settle();
            }

            expect(peer.sessions.unsecuredSessions.size).equals(0);
        });

        it("drops an unsecured message whose payload header is cut short without a warning", async () => {
            await using peer = await receiver();
            peer.exchanges.addProtocolHandler(silentHandler());
            const header = MessageCodec.encodePacketHeader({
                sessionId: UNICAST_UNSECURE_SESSION_ID,
                sessionType: SessionType.Unicast,
                hasPrivacyEnhancements: false,
                isControlMessage: false,
                hasMessageExtensions: false,
                messageId: 1,
                sourceNodeId: NodeId(1n),
            });

            const { levels } = await captureLevels(async () => {
                peer.transport.receive(Bytes.concat(header, Bytes.fromHex("01")));
                await settle();
            });

            // The discarded session logs its end at info level, as every discarded unsecured session does
            expect(levels.filter(level => level > LogLevel.INFO)).deep.equals([]);
            expect(peer.sessions.unsecuredSessions.size).equals(0);
        });

        /** Keeps every new exchange open and counts the messages it reads, in the order the exchanges opened. */
        function keepingHandler(delivered: Map<MessageExchange, number>): ProtocolHandler {
            return {
                id: SECURE_CHANNEL_PROTOCOL_ID,
                requiresSecureSession: false,
                async onNewExchange(exchange: MessageExchange) {
                    delivered.set(exchange, 0);
                    try {
                        while (true) {
                            await exchange.nextMessage();
                            delivered.set(exchange, (delivered.get(exchange) ?? 0) + 1);
                        }
                    } catch (error) {
                        ClosedError.accept(error);
                    }
                },
                async close() {},
            };
        }

        it("keeps the exchanges of two unsecured sessions with the same exchange id apart", async () => {
            await using peer = await receiver();
            const delivered = new Map<MessageExchange, number>();
            peer.exchanges.addProtocolHandler(keepingHandler(delivered));

            peer.transport.receive(unsecuredMessage(NodeId(1n), 1));
            await settle();
            peer.transport.receive(unsecuredMessage(NodeId(2n), 1));
            await settle();
            peer.transport.receive(unsecuredMessage(NodeId(1n), 2));
            await settle();

            expect([...delivered.values()]).deep.equals([2, 1]);
            for (const exchange of delivered.keys()) {
                await exchange.close();
            }
        });

        it("delivers the next message of an unsecured session to its exchange", async () => {
            await using peer = await receiver();
            const delivered = new Map<MessageExchange, number>();
            peer.exchanges.addProtocolHandler(keepingHandler(delivered));

            peer.transport.receive(unsecuredMessage(NodeId(1n), 1));
            await settle();
            peer.transport.receive(unsecuredMessage(NodeId(1n), 2));
            await settle();

            expect([...delivered.values()]).deep.equals([2]);
            for (const exchange of delivered.keys()) {
                await exchange.close();
            }
        });

        describe("exchange id allocation", () => {
            /**
             * Starts exchange N on `first` and keeps it open, then wraps the 16-bit exchange counter with one open
             * exchange on `second` for every other id.
             */
            async function wrappedCounter() {
                const peer = await receiver();
                const [first, second, third] = [9n, 10n, 11n].map(id =>
                    peer.sessions.createUnsecuredSession({
                        channel: peer.transport.channel,
                        initiatorNodeId: NodeId(id),
                    }),
                );
                const open = peer.exchanges.initiateExchangeForSession(first, SECURE_CHANNEL_PROTOCOL_ID);
                for (let i = 0; i < 0xffff; i++) {
                    peer.exchanges.initiateExchangeForSession(second, SECURE_CHANNEL_PROTOCOL_ID);
                }
                return {
                    peer,
                    first,
                    second,
                    third,
                    open,
                    async [Symbol.asyncDispose]() {
                        for (const session of [first, second, third]) {
                            await session.initiateClose();
                        }
                        await peer[Symbol.asyncDispose]();
                    },
                };
            }

            it("skips the id of an exchange still open on the session", async () => {
                await using wrapped = await wrappedCounter();

                const next = wrapped.peer.exchanges.initiateExchangeForSession(
                    wrapped.first,
                    SECURE_CHANNEL_PROTOCOL_ID,
                );

                expect(next.id).equals((wrapped.open.id + 1) & 0xffff);
            });

            it("tries all 65536 ids for the one free id of a session", async () => {
                await using wrapped = await wrappedCounter();
                const { peer, second, third } = wrapped;
                const onThird = peer.exchanges.initiateExchangeForSession(third, SECURE_CHANNEL_PROTOCOL_ID);
                expect(onThird.id).equals(wrapped.open.id);

                // The counter is one past the only id free on the second session, so that id is tried last of 65536
                const last = peer.exchanges.initiateExchangeForSession(second, SECURE_CHANNEL_PROTOCOL_ID);

                expect(last.id).equals(wrapped.open.id);
            });

            it("gives another session the id that is open on one session", async () => {
                await using wrapped = await wrappedCounter();

                const other = wrapped.peer.exchanges.initiateExchangeForSession(
                    wrapped.third,
                    SECURE_CHANNEL_PROTOCOL_ID,
                );

                expect(other.id).equals(wrapped.open.id);
            });

            it("refuses to start an exchange when every id is open on the session, before it creates one", async () => {
                await using wrapped = await wrappedCounter();
                const { peer, second } = wrapped;
                // The only id free on the second session is the one open on the first
                const last = peer.exchanges.initiateExchangeForSession(second, SECURE_CHANNEL_PROTOCOL_ID);
                expect(last.id).equals(wrapped.open.id);
                const openOnSecond = second.exchanges.size;

                expect(() => peer.exchanges.initiateExchangeForSession(second, SECURE_CHANNEL_PROTOCOL_ID)).throws(
                    ExchangeIdsExhaustedError,
                );
                expect(second.exchanges.size).equals(openOnSecond);
                expect(openOnSecond).equals(0x10000);
            });
        });

        it("does not apply the exchange limit to an unsecured session", async () => {
            await using peer = await receiver();
            const session = peer.sessions.createUnsecuredSession({
                channel: peer.transport.channel,
                initiatorNodeId: NodeId(9n),
            });
            const exchanges = new Array<MessageExchange>();
            for (let i = 0; i < 31; i++) {
                exchanges.push(peer.exchanges.initiateExchangeForSession(session, SECURE_CHANNEL_PROTOCOL_ID));
            }

            expect(exchanges.filter(exchange => exchange.considerClosed)).length(0);
            for (const exchange of exchanges) {
                await exchange.close();
            }
            await session.initiateClose();
        });

        it("closes every open exchange of every session with a shutdown cause", async () => {
            await using peer = await receiver();
            const exchanges = new Array<MessageExchange>();
            for (const initiatorNodeId of [NodeId(9n), NodeId(10n)]) {
                const session = peer.sessions.createUnsecuredSession({
                    channel: peer.transport.channel,
                    initiatorNodeId,
                });
                for (let i = 0; i < 2; i++) {
                    exchanges.push(peer.exchanges.initiateExchangeForSession(session, SECURE_CHANNEL_PROTOCOL_ID));
                }
            }

            await peer.exchanges.close();

            expect(exchanges.map(exchange => exchange.considerClosed === true)).deep.equals([true, true, true, true]);
            for (const exchange of exchanges) {
                let failure: unknown;
                try {
                    await exchange.send(SecureMessageType.IcdCheckInMessage, Bytes.empty);
                } catch (error) {
                    failure = error;
                }
                expect(failure).instanceOf(ClosedError);
                expect(failure instanceof ClosedError ? failure.cause : undefined).instanceOf(ShutdownError);
            }
        });

        it("closes the open exchanges when it closes", async () => {
            await using peer = await receiver();
            const delivered = new Map<MessageExchange, number>();
            peer.exchanges.addProtocolHandler(keepingHandler(delivered));
            peer.transport.receive(unsecuredMessage(NodeId(1n), 1));
            await settle();
            const [exchange] = delivered.keys();
            let closed = false;
            exchange.closed.once(() => {
                closed = true;
            });

            await peer.exchanges.close();

            expect(closed).equals(true);
        });

        it("keeps an exchange this node initiated apart from a peer exchange with the same id", async () => {
            await using peer = await receiver();
            const delivered = new Map<MessageExchange, number>();
            peer.exchanges.addProtocolHandler(keepingHandler(delivered));
            peer.transport.receive(unsecuredMessage(NodeId(1n), 1));
            await settle();
            const [peerExchange] = delivered.keys();
            const session = peerExchange.session;

            // The peer initiates an exchange with the id of the exchange this node initiated, so it opens a new one
            const ours = peer.exchanges.initiateExchangeForSession(session, SECURE_CHANNEL_PROTOCOL_ID);
            peer.transport.receive(unsecuredMessage(NodeId(1n), 2, false, ours.id));
            await settle();

            expect([...delivered.keys()].map(exchange => exchange.id)).deep.equals([1, ours.id]);
            expect([...delivered.values()]).deep.equals([1, 1]);
            await ours.close();
            await peerExchange.close();
        });

        it("logs an oversized UDP datagram at debug level", async () => {
            const environment = new Environment("test");
            const storage = new MemoryStorageDriver();
            storage.initialize();
            const crypto = new StandardCrypto();
            const sessions = new SessionManager({
                fabrics: new FabricManager(crypto),
                storage: new StorageContext(storage, ["context"]),
            });
            await sessions.construction.ready;
            let deliver: UdpSocket.Callback | undefined;
            const socket: UdpSocket = {
                maxPayloadSize: 1280,
                addMembership() {},
                dropMembership() {},
                onData(listener) {
                    deliver = listener;
                    return { close: async () => {} };
                },
                async send() {},
                async close() {},
                port: 5540,
                supports: () => true,
            };
            const transports = new TransportSet();
            transports.add(new UdpTransport(socket));
            const exchanges = new ExchangeManager({ lifetime: environment, entropy: crypto, transports, sessions });

            const { levels, entries } = await captureLevels(async () => {
                deliver?.(undefined, "fd00::1", 5540, new Uint8Array(1281));
                await settle();
            });

            expect(deliver).not.equals(undefined);
            expect(
                entries.filter(({ text }) => text.includes("larger than the maximum")).map(({ level }) => level),
            ).deep.equals([LogLevel.DEBUG]);
            expect(levels.filter(level => level > LogLevel.DEBUG)).deep.equals([]);
            await exchanges.close();
            await sessions.close();
        });

        it("logs no UDP oversize line for a datagram over the payload size on another transport", async () => {
            await using peer = await receiver();

            const { entries } = await captureLevels(async () => {
                peer.transport.receive(new Uint8Array(peer.transport.channel.maxPayloadSize + 1));
                await settle();
            });

            expect(entries.filter(({ text }) => text.includes("larger than the maximum"))).length(0);
        });

        it("accepts a UDP datagram of exactly the maximum payload size without an oversize log", async () => {
            const environment = new Environment("test");
            const storage = new MemoryStorageDriver();
            storage.initialize();
            const crypto = new StandardCrypto();
            const sessions = new SessionManager({
                fabrics: new FabricManager(crypto),
                storage: new StorageContext(storage, ["context"]),
            });
            await sessions.construction.ready;
            let deliver: UdpSocket.Callback | undefined;
            const socket: UdpSocket = {
                maxPayloadSize: 1280,
                addMembership() {},
                dropMembership() {},
                onData(listener) {
                    deliver = listener;
                    return { close: async () => {} };
                },
                async send() {},
                async close() {},
                port: 5540,
                supports: () => true,
            };
            const transports = new TransportSet();
            transports.add(new UdpTransport(socket));
            const exchanges = new ExchangeManager({ lifetime: environment, entropy: crypto, transports, sessions });

            const oversizeLogs = new Array<number>();
            for (const size of [1280, 1281]) {
                const { entries } = await captureLevels(async () => {
                    deliver?.(undefined, "fd00::1", 5540, new Uint8Array(size));
                    await settle();
                });
                oversizeLogs.push(entries.filter(({ text }) => text.includes("larger than the maximum")).length);
            }

            expect(oversizeLogs).deep.equals([0, 1]);
            await exchanges.close();
            await sessions.close();
        });

        it("discards the session when no handler is registered", async () => {
            await using peer = await receiver();

            peer.transport.receive(unsecuredMessage(NodeId(1n), 1, true));
            await settle();

            expect(peer.sessions.unsecuredSessions.size).equals(0);
        });
    });
});

/** Runs `fn` and records the levels of all log messages it causes. */
async function captureLevels<T>(fn: () => Promise<T>) {
    const dest = Logger.destinations.default;
    const original = { ...dest };
    const levels = new Array<LogLevel>();
    const entries = new Array<{ level: LogLevel; text: string }>();
    dest.level = LogLevel.DEBUG;
    dest.add = message => {
        levels.push(message.level);
        entries.push({ level: message.level, text: message.values.map(value => String(value)).join(" ") });
    };
    try {
        return { result: await fn(), levels, entries };
    } finally {
        Object.assign(Logger.destinations.default, original);
    }
}
