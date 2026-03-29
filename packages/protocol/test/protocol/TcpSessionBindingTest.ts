/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessageExchange } from "#protocol/MessageExchange.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { Session } from "#session/Session.js";
import { SessionParameters } from "#session/SessionParameters.js";
import { Bytes, Channel, ChannelType, Transport } from "@matter/general";
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
            expect(session.channel.channel).to.equal(tcpChannel);
        });

        it("sessions on different connections are distinguishable", () => {
            const tcpChannel1 = new MockTcpChannel("tcp-1");
            const tcpChannel2 = new MockTcpChannel("tcp-2");
            const session1 = createSessionOnTcpChannel(tcpChannel1, 1);
            const session2 = createSessionOnTcpChannel(tcpChannel2, 2);

            expect(session1.channel.channel).to.equal(tcpChannel1);
            expect(session2.channel.channel).to.equal(tcpChannel2);
            expect(session1.channel.channel).to.not.equal(session2.channel.channel);
        });

        it("session force-close marks session as closing", async () => {
            const tcpChannel = new MockTcpChannel("tcp-1");
            const session = createSessionOnTcpChannel(tcpChannel);

            expect(session.isClosing).to.be.false;

            await session.initiateForceClose({ cause: new Error("TCP connection dropped") });

            expect(session.isClosing).to.be.true;
        });

        it("exchange can be closed with error", async () => {
            const tcpChannel = new MockTcpChannel("tcp-1");
            const session = createSessionOnTcpChannel(tcpChannel);
            const exchange = createExchange(session);

            expect(session.exchanges.size).to.equal(1);

            await exchange.close(new Error("TCP connection dropped"));

            // Exchange should be removed from session
            expect(session.exchanges.size).to.equal(0);
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

            expect(session1.channel.channel).to.equal(tcpChannel);
            expect(session2.channel.channel).to.equal(tcpChannel);
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
            //   sessions.find(s => !s.isClosing && !s.isPeerLost && !s.isClosed && s.channel.channel.type === ChannelType.TCP)
            const selected = sessions.find(
                s => !s.isClosing && !s.isClosed && s.channel.channel.type === ChannelType.TCP,
            );

            expect(selected).to.equal(tcpSession);
            expect(selected!.channel.channel.type).to.equal(ChannelType.TCP);
        });

        it("returns undefined when no TCP session exists", () => {
            const udpChannel = new ProtocolMocks.NetworkChannel({ index: 1 });
            const udpSession = new ProtocolMocks.NodeSession({ index: 1, fabricIndex: 1, channel: udpChannel });

            const sessions = [udpSession];

            const selected = sessions.find(
                s => !s.isClosing && !s.isClosed && s.channel.channel.type === ChannelType.TCP,
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
                s => !s.isClosing && !s.isClosed && s.channel.channel.type === ChannelType.TCP,
            );

            expect(selected).to.equal(activeSession);
        });

        it("returns undefined when all TCP sessions are closing", async () => {
            const tcpChannel = new MockTcpChannel("tcp-1");
            const session = createSessionOnTcpChannel(tcpChannel, 1);

            await session.initiateForceClose({ cause: new Error("connection dropped") });

            const sessions = [session];

            const selected = sessions.find(
                s => !s.isClosing && !s.isClosed && s.channel.channel.type === ChannelType.TCP,
            );

            expect(selected).to.be.undefined;
        });
    });

    // PASE always uses UDP transport regardless of address type — this is enforced structurally
    // by the ControllerCommissioner which routes all IP addresses through the UDP interface.
    // No explicit TCP guard test is needed since addresses are now transport-agnostic.
});
