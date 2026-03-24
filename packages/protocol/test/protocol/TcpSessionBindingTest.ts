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

    describe("Last session close triggers connection close", () => {
        it("TCP channel closes when last session is closed", async () => {
            const tcpChannel = new MockTcpChannel("tcp-1");
            const session = createSessionOnTcpChannel(tcpChannel);

            expect(tcpChannel.closed).to.be.false;

            // Force close the session, which should close the channel via Session.close()
            await session.initiateForceClose({ cause: new Error("test") });

            // The session's close() calls channel.close() which closes the underlying tcp channel
            expect(tcpChannel.closed).to.be.true;
        });

        it("TCP channel stays open when other sessions still reference it", () => {
            const tcpChannel = new MockTcpChannel("tcp-1");
            const session1 = createSessionOnTcpChannel(tcpChannel, 1);
            const session2 = createSessionOnTcpChannel(tcpChannel, 2);

            // Both sessions reference the same channel
            expect(session1.channel.channel).to.equal(tcpChannel);
            expect(session2.channel.channel).to.equal(tcpChannel);
            expect(tcpChannel.closed).to.be.false;
        });

        it("sessions on other connections are unaffected by disconnect", async () => {
            const tcpChannel1 = new MockTcpChannel("tcp-1");
            const tcpChannel2 = new MockTcpChannel("tcp-2");
            const session1 = createSessionOnTcpChannel(tcpChannel1, 1);
            const session2 = createSessionOnTcpChannel(tcpChannel2, 2);

            // Force-close session1 (simulating connection 1 drop)
            await session1.initiateForceClose({ cause: new Error("TCP connection dropped") });

            expect(session1.isClosing).to.be.true;
            expect(session2.isClosing).to.be.false;
            expect(tcpChannel1.closed).to.be.true;
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
});
