/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, MessageCodec, SessionType } from "#codec/MessageCodec.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { SessionParameters } from "#index.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import type { MessageExchange } from "#protocol/MessageExchange.js";
import type { ProtocolHandler } from "#protocol/ProtocolHandler.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { SessionManager } from "#session/SessionManager.js";
import { UNICAST_UNSECURE_SESSION_ID } from "#session/UnsecuredSession.js";
import {
    Bytes,
    Channel,
    ChannelType,
    Environment,
    MemoryStorageDriver,
    NetworkError,
    StandardCrypto,
    StorageContext,
    Transport,
    TransportSet,
} from "@matter/general";
import { NodeId, SECURE_CHANNEL_PROTOCOL_ID, SecureMessageType } from "@matter/types";

/** A UDP-like transport that delivers datagrams on demand. */
class MockTransport implements Transport {
    readonly #listeners = new Set<(socket: Channel<Bytes>, data: Bytes) => void>();
    readonly channel: Channel<Bytes> = {
        maxPayloadSize: 1280,
        isReliable: false,
        supportsLargeMessages: false,
        name: "mock-udp",
        type: ChannelType.UDP,
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
    async function failingPeer() {
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

        const session = new ProtocolMocks.NodeSession({ manager: sessions });
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
