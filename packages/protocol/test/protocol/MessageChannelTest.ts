/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message, SessionType } from "#codec/MessageCodec.js";
import { MessageTooLargeError } from "#protocol/errors.js";
import { MessageChannel } from "#protocol/MessageChannel.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { MIN_TCP_SPEC_VERSION, SessionParameters } from "#session/SessionParameters.js";
import { TcpChannel } from "#transport/tcp/TcpChannel.js";
import {
    DEFAULT_MAX_TCP_MESSAGE_SIZE,
    isIpNetworkChannel,
    MAX_UDP_MESSAGE_SIZE,
    MockTcpConnection,
    type Channel,
    Bytes,
    type ServerAddressIp,
} from "@matter/general";

describe("MessageChannel socket swap", () => {
    it("emits networkAddressChanged when the socket swaps to a different address", () => {
        const channel = new ProtocolMocks.MessageChannel({ index: 1 });
        const original = channel.transportChannel;
        if (!isIpNetworkChannel(original)) {
            throw new Error("expected an IP network channel");
        }
        const onMessageChannel = new Array<ServerAddressIp>();
        const onTransportChannel = new Array<ServerAddressIp>();
        channel.networkAddressChanged.on(addr => {
            onMessageChannel.push(addr);
        });
        original.networkAddressChanged.on(addr => {
            onTransportChannel.push(addr);
        });

        channel.socket = new ProtocolMocks.NetworkChannel({ index: 2 });

        // The MessageChannel observable fires (this is what Peer must observe)…
        expect(onMessageChannel.length).equal(1);
        expect(onMessageChannel[0].ip).equal("::2");
        expect(channel.networkAddress?.ip).equal("::2");
        // …while the replaced transport channel's own observable does not — the reason Peer cannot rely on it.
        expect(onTransportChannel.length).equal(0);
    });

    it("does not emit when the socket swaps to the same address", () => {
        const channel = new ProtocolMocks.MessageChannel({ index: 1 });
        const seen = new Array<ServerAddressIp>();
        channel.networkAddressChanged.on(addr => {
            seen.push(addr);
        });

        channel.socket = new ProtocolMocks.NetworkChannel({ index: 1 });

        expect(seen.length).equal(0);
        expect(channel.networkAddress?.ip).equal("::1");
    });
});

describe("MessageChannel release", () => {
    function transportChannel() {
        const channel = new ProtocolMocks.NetworkChannel({ index: 1 });
        let closed = false;
        channel.close = async () => {
            closed = true;
        };
        return { channel, wasClosed: () => closed };
    }

    it("stops observing the transport channel address without closing the channel", async () => {
        const { channel, wasClosed } = transportChannel();
        const messageChannel = new ProtocolMocks.MessageChannel({ channel });
        expect(channel.networkAddressChanged.isObserved).true;

        await messageChannel.release();

        expect(channel.networkAddressChanged.isObserved).false;
        expect(wasClosed()).false;
        expect(messageChannel.closed).true;
    });

    it("closes the transport channel of an unreliable transport on close", async () => {
        const { channel, wasClosed } = transportChannel();
        const messageChannel = new ProtocolMocks.MessageChannel({ channel });

        await messageChannel.close();

        expect(channel.networkAddressChanged.isObserved).false;
        expect(wasClosed()).true;
    });
});

describe("MessageChannel maxPayloadSize", () => {
    function messageChannel(channel: Channel<Bytes>, sessionParameters: SessionParameters.Config) {
        const session = new ProtocolMocks.NodeSession({ channel: undefined, sessionParameters });
        return new ProtocolMocks.MessageChannel({ channel, session });
    }

    function tcpChannel() {
        const [, server] = MockTcpConnection.createPair("1.2.3.4", 5000, "5.6.7.8", 6000);
        return new TcpChannel(server);
    }

    const tcpPeer = { specificationVersion: MIN_TCP_SPEC_VERSION, supportedTransports: { tcpServer: true } };

    it("caps a TCP channel at the MAX_TCP_MESSAGE_SIZE the peer announced", async () => {
        const channel = tcpChannel();

        expect(messageChannel(channel, { ...tcpPeer, maxTcpMessageSize: 1526 }).maxPayloadSize).equal(1526);

        await channel.close();
    });

    it("keeps the own TCP limit when the peer announces a larger one", async () => {
        const channel = tcpChannel();

        expect(messageChannel(channel, { ...tcpPeer, maxTcpMessageSize: 1_000_000 }).maxPayloadSize).equal(
            DEFAULT_MAX_TCP_MESSAGE_SIZE,
        );

        await channel.close();
    });

    it("uses the spec default for a TCP peer that announces no limit", async () => {
        const channel = tcpChannel();

        expect(messageChannel(channel, tcpPeer).maxPayloadSize).equal(DEFAULT_MAX_TCP_MESSAGE_SIZE);

        await channel.close();
    });

    it("uses the spec default for a peer that announces no TCP support", async () => {
        const [, server] = MockTcpConnection.createPair("1.2.3.4", 5000, "5.6.7.8", 6000);
        const channel = new TcpChannel(server, 100_000);

        expect(messageChannel(channel, {}).maxPayloadSize).equal(DEFAULT_MAX_TCP_MESSAGE_SIZE);

        await channel.close();
    });

    it("does not cap a TCP channel below the UDP message size", async () => {
        const channel = tcpChannel();

        expect(messageChannel(channel, { ...tcpPeer, maxTcpMessageSize: 100 }).maxPayloadSize).equal(
            MAX_UDP_MESSAGE_SIZE,
        );

        await channel.close();
    });

    it("ignores the peer's TCP limit on a non-TCP channel with large-message support", () => {
        const channel = new ProtocolMocks.NetworkChannel({ index: 1, maxPayloadSize: 100_000 });
        channel.supportsLargeMessages = true;

        expect(messageChannel(channel, { ...tcpPeer, maxTcpMessageSize: 1526 }).maxPayloadSize).equal(100_000);
    });

    it("ignores the peer's TCP limit on a channel without large-message support", () => {
        const channel = new ProtocolMocks.NetworkChannel({ index: 1 });

        expect(messageChannel(channel, { ...tcpPeer, maxTcpMessageSize: 1000 }).maxPayloadSize).equal(
            MAX_UDP_MESSAGE_SIZE,
        );
    });
});

describe("MessageChannel send over TCP", () => {
    const message: Message = {
        packetHeader: {
            sessionId: 1,
            sessionType: SessionType.Unicast,
            hasPrivacyEnhancements: false,
            isControlMessage: false,
            hasMessageExtensions: false,
            messageId: 1,
        },
        payloadHeader: {
            exchangeId: 1,
            protocolId: 1,
            messageType: 1,
            isInitiatorMessage: true,
            requiresAck: false,
            hasSecuredExtension: false,
        },
        payload: Bytes.empty,
    };

    it("refuses a message above the peer's MAX_TCP_MESSAGE_SIZE instead of sending it", async () => {
        const [, server] = MockTcpConnection.createPair("1.2.3.4", 5000, "5.6.7.8", 6000);
        const tcp = new TcpChannel(server);
        let sent = false;
        tcp.send = async () => {
            sent = true;
        };
        const session = new ProtocolMocks.NodeSession({
            channel: undefined,
            sessionParameters: {
                specificationVersion: MIN_TCP_SPEC_VERSION,
                supportedTransports: { tcpServer: true },
                maxTcpMessageSize: 1526,
            },
        });
        session.encode = () => ({
            header: message.packetHeader,
            headerBytes: Bytes.empty,
            applicationPayload: new Uint8Array(1527),
        });

        await expect(new MessageChannel(tcp, session).send(message)).rejectedWith(
            MessageTooLargeError,
            "exceeds the TCP limit",
        );
        expect(sent).false;

        await tcp.close();
    });
});
