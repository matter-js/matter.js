/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, MessageCodec, SessionType } from "#codec/MessageCodec.js";
import { Fabric } from "#fabric/Fabric.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { SessionParameters } from "#index.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { MessageCounter } from "#protocol/MessageCounter.js";
import type { MessageExchange } from "#protocol/MessageExchange.js";
import type { ProtocolHandler } from "#protocol/ProtocolHandler.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { GroupSession } from "#session/GroupSession.js";
import { SessionManager } from "#session/SessionManager.js";
import { UNICAST_UNSECURE_SESSION_ID } from "#session/UnsecuredSession.js";
import {
    Bytes,
    Channel,
    ChannelType,
    UdpNetworkChannel,
    Environment,
    Key,
    MemoryStorageDriver,
    NetworkError,
    Observable,
    PrivateKey,
    StandardCrypto,
    StorageContext,
    Transport,
    TransportSet,
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
            parameters: {} as SessionParameters,
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
                parameters: {} as SessionParameters,
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
                sessions,
                exchanges,
                transport,
                async [Symbol.asyncDispose]() {
                    await exchanges.close();
                    await sessions.close();
                },
            };
        }

        /** A datagram for group 2 of the fabric, as it arrives from `ip`. */
        function groupDatagram(fabric: Fabric, messageId: number) {
            const current = fabric.groups.keySets.currentKeyForId(1);
            const session = new GroupSession({
                id: current.sessionId!,
                fabric,
                keySetId: 1,
                operationalGroupKey: current.key,
                operationalPrivacyKey: current.privacyKey,
                peerNodeId: NodeId(0xffffffffffff0000n | 2n),
                multicastAddress: fabric.groups.multicastAddressFor(GroupId(2)),
                messageCounter: new MessageCounter(fabric.crypto),
            });

            return MessageCodec.encodePacket(
                session.encode({
                    packetHeader: {
                        sessionId: current.sessionId!,
                        sessionType: SessionType.Group,
                        messageId,
                        destGroupId: 2,
                        sourceNodeId: fabric.nodeId,
                        hasPrivacyEnhancements: true,
                        isControlMessage: false,
                        hasMessageExtensions: false,
                    },
                    payloadHeader: {
                        isInitiatorMessage: true,
                        requiresAck: false,
                        messageType: SecureMessageType.IcdCheckInMessage,
                        exchangeId: 0x1234,
                        protocolId: SECURE_CHANNEL_PROTOCOL_ID,
                        ackedMessageId: undefined,
                        hasSecuredExtension: false,
                    },
                    payload: Bytes.empty,
                }),
            );
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

                peer.transport.receive(groupDatagram(peer.fabric, 0x1000 + index));
                await settle();
            }

            expect(messages.map(message => message.receivedFrom)).deep.equals(["fd00::1", "fd00::2"]);
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
                parameters: {} as SessionParameters,
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

        function unsecuredMessage(sourceNodeId: NodeId, messageId: number, requiresAck = false) {
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
                        exchangeId: 1,
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

        it("discards the session when no handler is registered", async () => {
            await using peer = await receiver();

            peer.transport.receive(unsecuredMessage(NodeId(1n), 1, true));
            await settle();

            expect(peer.sessions.unsecuredSessions.size).equals(0);
        });
    });
});
