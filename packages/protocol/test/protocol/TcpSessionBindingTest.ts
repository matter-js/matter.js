/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FabricManager } from "#fabric/FabricManager.js";
import { TransientPeerCommunicationError } from "#peer/PeerCommunicationError.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { Session } from "#session/Session.js";
import { SessionManager } from "#session/SessionManager.js";
import { SessionParameters } from "#session/SessionParameters.js";
import {
    Bytes,
    causedBy,
    Channel,
    ChannelType,
    Environment,
    MemoryStorageDriver,
    Millis,
    NetworkError,
    StandardCrypto,
    StorageContext,
    Time,
    Transport,
    TransportClosedError,
    TransportSet,
} from "@matter/general";
import { SECURE_CHANNEL_PROTOCOL_ID } from "@matter/types";

/**
 * A mock TCP channel for testing session-connection binding.
 */
class MockTcpChannel implements Channel<Bytes> {
    maxPayloadSize = 1024 * 1024;
    isReliable = true;
    supportsLargeMessages = true;
    name: string;
    type = ChannelType.TCP;
    closed = false;

    constructor(name = "mock-tcp") {
        this.name = name;
    }

    async send(): Promise<void> {}

    async close() {
        this.closed = true;
    }
}

/**
 * A mock connection-oriented transport that can fire onDisconnect events.
 */
class MockTcpTransport implements Transport {
    readonly #dataListeners = new Set<(socket: Channel<Bytes>, data: Bytes) => void>();
    readonly #disconnectListeners = new Set<(channel: Channel<Bytes>) => void>();

    onData(listener: (socket: Channel<Bytes>, data: Bytes) => void): Transport.Listener {
        this.#dataListeners.add(listener);
        return {
            close: async () => {
                this.#dataListeners.delete(listener);
            },
        };
    }

    onDisconnect(listener: (channel: Channel<Bytes>) => void): Transport.Listener {
        this.#disconnectListeners.add(listener);
        return {
            close: async () => {
                this.#disconnectListeners.delete(listener);
            },
        };
    }

    supports(type: ChannelType): boolean {
        return type === ChannelType.TCP;
    }

    async openChannel(): Promise<Channel<Bytes>> {
        throw new Error("Not implemented in mock");
    }

    async close(): Promise<void> {}

    /** Simulate a TCP connection drop. */
    simulateDisconnect(channel: Channel<Bytes>) {
        for (const listener of this.#disconnectListeners) {
            listener(channel);
        }
    }
}

/**
 * Creates a mock NodeSession bound to a given TCP channel.
 */
function createSessionOnTcpChannel(channel: MockTcpChannel, index = 1, fabricIndex = 1): ProtocolMocks.NodeSession {
    return new ProtocolMocks.NodeSession({
        index,
        fabricIndex,
        channel,
    });
}

/**
 * Creates a MessageExchange for a session with tracking.
 */
function createExchange(session: Session) {
    const exchange = MessageExchange.initiate(
        {
            session,
            localSessionParameters: SessionParameters(SessionParameters.defaults),
            localAdditionalMrpDelay: Millis(0),
            localFixedMrpBackoff: Millis(0),
            async peerLost() {},
            retry() {},
        },
        1,
        SECURE_CHANNEL_PROTOCOL_ID,
    );
    return exchange;
}

describe("TCP Session-Connection Binding", () => {
    describe("Connection drop evicts sessions", () => {
        it("finds sessions by channel identity", () => {
            const tcpChannel = new MockTcpChannel("tcp-1");
            const session = createSessionOnTcpChannel(tcpChannel);

            // Verify the session's underlying channel matches by identity
            expect(session.channel.transportChannel).to.equal(tcpChannel);
        });

        it("sessions on different connections are distinguishable", () => {
            const tcpChannel1 = new MockTcpChannel("tcp-1");
            const tcpChannel2 = new MockTcpChannel("tcp-2");
            const session1 = createSessionOnTcpChannel(tcpChannel1, 1);
            const session2 = createSessionOnTcpChannel(tcpChannel2, 2);

            expect(session1.channel.transportChannel).to.equal(tcpChannel1);
            expect(session2.channel.transportChannel).to.equal(tcpChannel2);
            expect(session1.channel.transportChannel).to.not.equal(session2.channel.transportChannel);
        });

        it("session force-close marks session as closing", async () => {
            const tcpChannel = new MockTcpChannel("tcp-1");
            const session = createSessionOnTcpChannel(tcpChannel);

            expect(session.isClosing).to.be.false;

            await session.initiateForceClose({ cause: new TransportClosedError("TCP connection dropped") });

            expect(session.isClosing).to.be.true;
        });

        it("exchange can be closed with error", async () => {
            const tcpChannel = new MockTcpChannel("tcp-1");
            const session = createSessionOnTcpChannel(tcpChannel);
            const exchange = createExchange(session);

            expect(session.exchanges.size).to.equal(1);

            await exchange.close(new TransportClosedError("TCP connection dropped"));

            // Exchange should be removed from session
            expect(session.exchanges.size).to.equal(0);
        });
    });

    // The cases above construct the cause themselves, so they pin the shape of a disconnect rather
    // than what a disconnect does. These drive the manager's own listener.
    describe("the manager's own reaction to a dropped connection", () => {
        async function managerOn(transport: MockTcpTransport) {
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
            transports.add(transport);

            return {
                sessions,
                exchanges,
                async [Symbol.asyncDispose]() {
                    await exchanges.close();
                    await sessions.close();
                },
            };
        }

        /**
         * Waits for the disconnect the manager handles on a worker nothing here can await.
         *
         * Bounded rather than a fixed number of turns: the handler closes each exchange before it
         * force-closes the session, so how many turns it needs depends on what the session carries.
         */
        async function settled(condition: () => boolean) {
            for (let turn = 0; turn < 50 && !condition(); turn++) {
                await Time.macrotask;
            }
        }

        it("closes the sessions bound to the connection that dropped", async () => {
            const transport = new MockTcpTransport();
            await using manager = await managerOn(transport);

            const channel = new MockTcpChannel("tcp-1");
            const session = createSessionOnTcpChannel(channel);
            manager.sessions.sessions.add(session);

            transport.simulateDisconnect(channel);
            await settled(() => session.isClosing);

            expect(session.isClosing, "the session bound to the dropped connection is closing").true;
        });

        // Matter Core § 4.15.1 invalidates the sessions *bound to* the connection, not every session
        // with the peer. A session on another connection has not been told anything.
        it("leaves a session on another connection alone", async () => {
            const transport = new MockTcpTransport();
            await using manager = await managerOn(transport);

            const dropped = new MockTcpChannel("tcp-1");
            const surviving = new MockTcpChannel("tcp-2");
            const onDropped = createSessionOnTcpChannel(dropped, 1);
            const onSurviving = createSessionOnTcpChannel(surviving, 2);
            manager.sessions.sessions.add(onDropped);
            manager.sessions.sessions.add(onSurviving);

            // Settling on *both* rather than on the dropped one: a wait that ended as soon as the
            // dropped session closed would assert the survivor before the handler could have reached
            // it, and would pass just as well against a handler that closes everything
            transport.simulateDisconnect(dropped);
            await settled(() => onDropped.isClosing && onSurviving.isClosing);

            expect(onDropped.isClosing, "the session on the dropped connection is closing").true;
            expect(onSurviving.isClosing, "the session on the other connection is untouched").false;
        });

        // The cause is a dispatch key: `causedBy` walks it, and a `TransientPeerCommunicationError`
        // or `NetworkError` here would have consumers treat the peer as lost or unreachable, which a
        // connection drop does not establish
        it("gives the closed exchange a cause that claims nothing about the peer", async () => {
            const transport = new MockTcpTransport();
            await using manager = await managerOn(transport);

            const channel = new MockTcpChannel("tcp-1");
            const session = createSessionOnTcpChannel(channel);
            manager.sessions.sessions.add(session);
            const exchange = createExchange(session);

            let cause: unknown;
            try {
                transport.simulateDisconnect(channel);
                await settled(() => session.isClosing);
                await exchange.nextMessage();
            } catch (e) {
                cause = e;
            }

            expect(cause, "the exchange rejects once its connection is gone").not.undefined;
            expect(causedBy(cause, TransportClosedError), "the cause names a closed transport").true;
            expect(causedBy(cause, NetworkError), "the cause does not claim the peer is unreachable").false;
            expect(causedBy(cause, TransientPeerCommunicationError), "the cause does not claim the peer was lost")
                .false;
        });
    });

    describe("MockTcpTransport disconnect events", () => {
        it("fires disconnect listeners when connection drops", () => {
            const transport = new MockTcpTransport();
            const tcpChannel = new MockTcpChannel("tcp-1");
            const disconnectedChannels: Channel<Bytes>[] = [];

            transport.onDisconnect(channel => {
                disconnectedChannels.push(channel);
            });

            transport.simulateDisconnect(tcpChannel);

            expect(disconnectedChannels).to.have.length(1);
            expect(disconnectedChannels[0]).to.equal(tcpChannel);
        });

        it("disconnect listener can be removed", async () => {
            const transport = new MockTcpTransport();
            const tcpChannel = new MockTcpChannel("tcp-1");
            const disconnectedChannels: Channel<Bytes>[] = [];

            const listener = transport.onDisconnect(channel => {
                disconnectedChannels.push(channel);
            });

            await listener.close();
            transport.simulateDisconnect(tcpChannel);

            expect(disconnectedChannels).to.have.length(0);
        });

        it("onDisconnect is detected via typeof check", () => {
            const transport = new MockTcpTransport();
            expect(typeof (transport as any).onDisconnect).to.equal("function");
        });
    });

    describe("TCP connection lifecycle", () => {
        it("TCP connection is NOT closed by MessageChannel.close()", async () => {
            // TCP connections are persistent and shared across sessions. They are managed
            // by TcpTransport and ExchangeManager, not by individual MessageChannel.close().
            const tcpChannel = new MockTcpChannel("tcp-1");
            const session = createSessionOnTcpChannel(tcpChannel);

            expect(tcpChannel.closed).to.be.false;

            await session.initiateForceClose({ cause: new Error("test") });

            // TCP channel should stay open — ExchangeManager handles TCP connection closure
            expect(tcpChannel.closed).to.be.false;
        });

        it("multiple sessions can share the same TCP connection", () => {
            const tcpChannel = new MockTcpChannel("tcp-1");
            const session1 = createSessionOnTcpChannel(tcpChannel, 1);
            const session2 = createSessionOnTcpChannel(tcpChannel, 2);

            expect(session1.channel.transportChannel).to.equal(tcpChannel);
            expect(session2.channel.transportChannel).to.equal(tcpChannel);
            expect(tcpChannel.closed).to.be.false;
        });

        it("closing one session does not affect sessions on other connections", async () => {
            const tcpChannel1 = new MockTcpChannel("tcp-1");
            const tcpChannel2 = new MockTcpChannel("tcp-2");
            const session1 = createSessionOnTcpChannel(tcpChannel1, 1);
            const session2 = createSessionOnTcpChannel(tcpChannel2, 2);

            await session1.initiateForceClose({ cause: new Error("test") });

            expect(session1.isClosing).to.be.true;
            expect(session2.isClosing).to.be.false;
            // Both TCP channels remain open — ExchangeManager manages their lifecycle
            expect(tcpChannel1.closed).to.be.false;
            expect(tcpChannel2.closed).to.be.false;
        });
    });

    describe("Channel type detection", () => {
        it("TCP channels have type TCP", () => {
            const tcpChannel = new MockTcpChannel();
            expect(tcpChannel.type).to.equal(ChannelType.TCP);
        });

        it("UDP channels have type UDP", () => {
            const udpChannel = new ProtocolMocks.NetworkChannel({ index: 1 });
            expect(udpChannel.type).to.equal(ChannelType.UDP);
        });
    });

    describe("TCP session selection", () => {
        // Tests the session filtering pattern used by PeerExchangeProvider.initiateExchange
        // when requiredTransport === ChannelType.TCP.  PeerExchangeProvider itself requires
        // a full Peer + PeerConnection.Context, but the filtering logic can be validated
        // directly on mock sessions.

        it("finds a TCP session among mixed sessions", () => {
            const tcpChannel = new MockTcpChannel("tcp-1");
            const udpChannel = new ProtocolMocks.NetworkChannel({ index: 1 });
            const tcpSession = createSessionOnTcpChannel(tcpChannel, 1);
            const udpSession = new ProtocolMocks.NodeSession({ index: 2, fabricIndex: 1, channel: udpChannel });

            const sessions = [udpSession, tcpSession];

            // This mirrors PeerExchangeProvider's TCP session selection:
            //   sessions.find(s => !s.isClosing && !s.isPeerLost && !s.isClosed && s.channel.transportChannel.type === ChannelType.TCP)
            const selected = sessions.find(
                s => !s.isClosing && !s.isClosed && s.channel.transportChannel.type === ChannelType.TCP,
            );

            expect(selected).to.equal(tcpSession);
            expect(selected!.channel.transportChannel.type).to.equal(ChannelType.TCP);
        });

        it("returns undefined when no TCP session exists", () => {
            const udpChannel = new ProtocolMocks.NetworkChannel({ index: 1 });
            const udpSession = new ProtocolMocks.NodeSession({ index: 1, fabricIndex: 1, channel: udpChannel });

            const sessions = [udpSession];

            const selected = sessions.find(
                s => !s.isClosing && !s.isClosed && s.channel.transportChannel.type === ChannelType.TCP,
            );

            expect(selected).to.be.undefined;
        });

        it("skips closing TCP sessions", async () => {
            const tcpChannel1 = new MockTcpChannel("tcp-closing");
            const tcpChannel2 = new MockTcpChannel("tcp-active");
            const closingSession = createSessionOnTcpChannel(tcpChannel1, 1);
            const activeSession = createSessionOnTcpChannel(tcpChannel2, 2);

            await closingSession.initiateForceClose({ cause: new Error("connection dropped") });

            const sessions = [closingSession, activeSession];

            const selected = sessions.find(
                s => !s.isClosing && !s.isClosed && s.channel.transportChannel.type === ChannelType.TCP,
            );

            expect(selected).to.equal(activeSession);
        });

        it("returns undefined when all TCP sessions are closing", async () => {
            const tcpChannel = new MockTcpChannel("tcp-1");
            const session = createSessionOnTcpChannel(tcpChannel, 1);

            await session.initiateForceClose({ cause: new Error("connection dropped") });

            const sessions = [session];

            const selected = sessions.find(
                s => !s.isClosing && !s.isClosed && s.channel.transportChannel.type === ChannelType.TCP,
            );

            expect(selected).to.be.undefined;
        });
    });

    // PASE always uses UDP transport regardless of address type — this is enforced structurally
    // by the ControllerCommissioner which routes all IP addresses through the UDP interface.
    // No explicit TCP guard test is needed since addresses are now transport-agnostic.
});
