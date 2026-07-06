/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from "#codec/MessageCodec.js";
import { NetworkProfile } from "#peer/NetworkProfile.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { SessionParameters } from "#session/SessionParameters.js";
import { Bytes, Duration, MatterFlowError, Millis, NetworkError, Seconds, Semaphore } from "@matter/general";
import { BDX_PROTOCOL_ID, SECURE_CHANNEL_PROTOCOL_ID, SecureMessageType } from "@matter/types";

/**
 * Creates a NodeSession whose channel send() throws to simulate a hard network failure.
 *
 * We override send on the channel instance rather than subclassing because the Session
 * setter guards against channel replacement after construction.
 */
function makeThrowingSession(): ProtocolMocks.NodeSession {
    const session = new ProtocolMocks.NodeSession();
    (session.channel as any).send = async (_message: Message): Promise<void> => {
        throw new NetworkError("Simulated network failure");
    };
    return session;
}

/**
 * Creates a MessageExchange with a trackable peerLost spy.
 */
function createExchange(session: ProtocolMocks.NodeSession, protocolId: number = SECURE_CHANNEL_PROTOCOL_ID) {
    const peerLostCalled = { value: false };
    const exchange = MessageExchange.initiate(
        {
            session,
            localSessionParameters: SessionParameters(SessionParameters.defaults),
            localAdditionalMrpDelay: Millis(0),
            async peerLost() {
                peerLostCalled.value = true;
            },
            retry() {},
        },
        1,
        protocolId,
    );
    return { exchange, peerLostCalled };
}

/**
 * A minimal inbound message compatible with MessageExchange.onMessageReceived():
 * - requiresAck: false so no ack send is triggered on the channel
 * - protocolId matches the exchange protocol to pass the protocol check
 */
function fakeInboundMessage(overrides?: {
    messageId?: number;
    protocolId?: number;
    messageType?: number;
    payload?: Bytes;
    ackedMessageId?: number;
}): Message {
    return {
        packetHeader: { messageId: overrides?.messageId ?? 1 },
        payloadHeader: {
            protocolId: overrides?.protocolId ?? SECURE_CHANNEL_PROTOCOL_ID,
            messageType: overrides?.messageType ?? 1,
            exchangeId: 1,
            isInitiatorMessage: false,
            requiresAck: false,
            ackedMessageId: overrides?.ackedMessageId,
        },
        payload: overrides?.payload ?? Bytes.empty,
    } as unknown as Message;
}

describe("MessageExchange", () => {
    describe("peer loss declaration", () => {
        describe("send()", () => {
            it("declares peer lost when exchange has received no messages", async () => {
                const { exchange, peerLostCalled } = createExchange(makeThrowingSession());

                await expect(exchange.send(0, Bytes.empty)).to.be.rejectedWith(NetworkError);

                expect(peerLostCalled.value).to.be.true;
            });

            it("does not declare peer lost when exchange already received at least one message", async () => {
                const { exchange, peerLostCalled } = createExchange(makeThrowingSession());

                await exchange.onMessageReceived(fakeInboundMessage());
                await expect(exchange.send(0, Bytes.empty)).to.be.rejectedWith(NetworkError);

                expect(peerLostCalled.value).to.be.false;
            });
        });

        describe("nextMessage()", () => {
            it("declares peer lost when exchange has received no messages", async () => {
                const session = new ProtocolMocks.NodeSession();
                const { exchange, peerLostCalled } = createExchange(session);

                await expect(exchange.nextMessage({ timeout: Millis(0) })).to.be.rejected;

                expect(peerLostCalled.value).to.be.true;
            });

            it("does not declare peer lost when exchange already received at least one message", async () => {
                const session = new ProtocolMocks.NodeSession();
                const { exchange, peerLostCalled } = createExchange(session);

                // Deliver and drain one inbound message so the received counter is > 0
                await exchange.onMessageReceived(fakeInboundMessage());
                await exchange.nextMessage({ timeout: Millis(0) }); // drains the queued message

                // Subsequent timeout with an empty queue should not declare peer lost
                await expect(exchange.nextMessage({ timeout: Millis(0) })).to.be.rejected;

                expect(peerLostCalled.value).to.be.false;
            });
        });
    });

    describe("hasUnackedMessage", () => {
        before(() => MockTime.enable());

        it("is false before any send", () => {
            const { exchange } = createExchange(new ProtocolMocks.NodeSession());
            expect(exchange.hasUnackedMessage).to.be.false;
        });

        it("is true while a sent message awaits ack and clears once acked", async () => {
            const channel = new ProtocolMocks.NetworkChannel({ index: 1 });
            channel.isReliable = false; // engage MRP so the send awaits an ack
            const session = new ProtocolMocks.NodeSession({ channel });
            let sentMessageId: number | undefined;
            const realSend = session.channel.send.bind(session.channel);
            (session.channel as any).send = async (...args: Parameters<typeof realSend>) => {
                sentMessageId ??= args[0].packetHeader.messageId;
                return realSend(...args);
            };
            const { exchange } = createExchange(session);

            const sendPromise = exchange.send(1, Bytes.empty, { requiresAck: true });
            // Let the send progress past the async message counter into the await-ack state
            for (let i = 0; i < 10 && !exchange.hasUnackedMessage; i++) {
                await MockTime.yield3();
            }

            expect(exchange.hasUnackedMessage).to.be.true;

            await exchange.onMessageReceived(fakeInboundMessage({ messageId: 2, ackedMessageId: sentMessageId }));
            await sendPromise;

            expect(exchange.hasUnackedMessage).to.be.false;
        });
    });

    describe("activity tracking", () => {
        before(() => MockTime.enable());

        it("updates lastActive on receive", async () => {
            const { exchange } = createExchange(new ProtocolMocks.NodeSession());
            const before = exchange.lastActive;

            await MockTime.advance(1000);
            await exchange.onMessageReceived(fakeInboundMessage());

            expect(exchange.lastActive).to.equal(before + 1000);
        });

        it("updates lastActive on send", async () => {
            const session = new ProtocolMocks.NodeSession();
            (session.channel as any).send = async (): Promise<void> => {};
            const { exchange } = createExchange(session);
            const before = exchange.lastActive;

            await MockTime.advance(2000);
            await exchange.send(0, Bytes.empty, { requiresAck: false, disableMrpLogic: true });

            expect(exchange.lastActive).to.equal(before + 2000);
        });
    });

    describe("cross-protocol StatusReport", () => {
        it("accepts SecureChannel StatusReport on a non-SecureChannel exchange and delivers it to the consumer", async () => {
            // Reproduces the case where a peer sends a spec-compliant StatusReport (protocolId=0, type=0x40)
            // within an exchange that runs a different protocol (here: BDX, protocolId=2).
            const session = new ProtocolMocks.NodeSession();
            const { exchange } = createExchange(session, BDX_PROTOCOL_ID);

            // Payload bytes from a real BDX TransferFailedUnknownError StatusReport
            // (generalStatus=Failure, protocolId=BDX, protocolStatus=0x1f).
            const statusReportPayload = new Uint8Array([0x01, 0x00, 0x02, 0x00, 0x00, 0x00, 0x1f, 0x00]);
            const message = fakeInboundMessage({
                protocolId: SECURE_CHANNEL_PROTOCOL_ID,
                messageType: SecureMessageType.StatusReport,
                payload: statusReportPayload,
            });

            await exchange.onMessageReceived(message);

            const received = await exchange.nextMessage({ timeout: Millis(0) });
            expect(received.payloadHeader.protocolId).equals(SECURE_CHANNEL_PROTOCOL_ID);
            expect(received.payloadHeader.messageType).equals(SecureMessageType.StatusReport);
            expect(received.payload).deep.equals(statusReportPayload);
        });

        it("still rejects non-StatusReport SecureChannel messages on a non-SecureChannel exchange", async () => {
            const session = new ProtocolMocks.NodeSession();
            const { exchange } = createExchange(session, BDX_PROTOCOL_ID);

            const message = fakeInboundMessage({
                protocolId: SECURE_CHANNEL_PROTOCOL_ID,
                messageType: SecureMessageType.PbkdfParamRequest,
            });

            await expect(exchange.onMessageReceived(message)).to.be.rejectedWith(MatterFlowError);
        });

        it("stamps the SecureChannel protocol id on outgoing StatusReports from a non-SecureChannel exchange", async () => {
            const session = new ProtocolMocks.NodeSession();
            const sentMessages = new Array<Message>();
            (session.channel as any).send = async (message: Message): Promise<void> => {
                sentMessages.push(message);
            };
            const { exchange } = createExchange(session, BDX_PROTOCOL_ID);

            // Send a StatusReport via exchange.send() on a BDX exchange (protocolId=2).
            // The outgoing message must carry SECURE_CHANNEL_PROTOCOL_ID per Matter spec 4.10.
            await exchange.send(
                SecureMessageType.StatusReport,
                new Uint8Array([0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00]),
                { requiresAck: false, disableMrpLogic: true },
            );

            expect(sentMessages.length).equals(1);
            expect(sentMessages[0].payloadHeader.protocolId).equals(SECURE_CHANNEL_PROTOCOL_ID);
            expect(sentMessages[0].payloadHeader.messageType).equals(SecureMessageType.StatusReport);
        });

        it("keeps the exchange's protocol id on non-StatusReport outgoing messages", async () => {
            const session = new ProtocolMocks.NodeSession();
            const sentMessages = new Array<Message>();
            (session.channel as any).send = async (message: Message): Promise<void> => {
                sentMessages.push(message);
            };
            const { exchange } = createExchange(session, BDX_PROTOCOL_ID);

            // Use a BDX BlockQuery (opcode 0x10, shares value with StandaloneAck) to also guard
            // against accidentally treating it as a standalone-ack-style cross-protocol message.
            await exchange.send(0x10, new Uint8Array([0x00]), { requiresAck: false, disableMrpLogic: true });

            expect(sentMessages.length).equals(1);
            expect(sentMessages[0].payloadHeader.protocolId).equals(BDX_PROTOCOL_ID);
            expect(sentMessages[0].payloadHeader.messageType).equals(0x10);
        });
    });

    describe("MRP backoff margin", () => {
        // A throttle profile whose own additionalMrpDelay is deliberately wrong; the exchange must ignore it.
        function unlimitedThrottle(): NetworkProfile {
            return { id: "unlimited", semaphore: new Semaphore("test", Infinity), additionalMrpDelay: Seconds(5) };
        }

        // Captures the additionalDelay the exchange passes to the channel, then aborts the send before it awaits
        // an ack so the test does not block.
        async function captureAdditionalDelay(options: {
            localAdditionalMrpDelay: Duration;
            peerAdditionalMrpDelay?: Duration;
            network?: NetworkProfile;
        }): Promise<Duration | undefined> {
            // MRP only engages on unreliable transports; the default mock channel is reliable.
            const channel = new ProtocolMocks.NetworkChannel({ index: 1 });
            channel.isReliable = false;
            const session = new ProtocolMocks.NodeSession({ channel });
            let captured: Duration | undefined;
            (session.channel as any).getMrpResubmissionBackOffTime = (
                _retransmissionCount: number,
                _sessionParameters: unknown,
                _calculateMaximum: boolean,
                additionalDelay?: Duration,
            ) => {
                captured = additionalDelay;
                throw new NetworkError("captured");
            };

            const exchange = MessageExchange.initiate(
                {
                    session,
                    localSessionParameters: SessionParameters(SessionParameters.defaults),
                    localAdditionalMrpDelay: options.localAdditionalMrpDelay,
                    async peerLost() {},
                    retry() {},
                },
                1,
                SECURE_CHANNEL_PROTOCOL_ID,
                { network: options.network, peerAdditionalMrpDelay: options.peerAdditionalMrpDelay },
            );

            await expect(exchange.send(1, Bytes.empty, { requiresAck: true })).to.be.rejectedWith("captured");
            return captured;
        }

        it("uses peerAdditionalMrpDelay and ignores the throttle profile margin", async () => {
            const captured = await captureAdditionalDelay({
                localAdditionalMrpDelay: Millis(0),
                peerAdditionalMrpDelay: Seconds(1.5),
                network: unlimitedThrottle(),
            });

            expect(captured).equals(Seconds(1.5));
        });

        it("falls back to localAdditionalMrpDelay as a floor when no peer margin is given", async () => {
            const captured = await captureAdditionalDelay({
                localAdditionalMrpDelay: Seconds(1.5),
                peerAdditionalMrpDelay: undefined,
                network: unlimitedThrottle(),
            });

            expect(captured).equals(Seconds(1.5));
        });

        it("applies no margin when neither local nor peer margin is set", async () => {
            const captured = await captureAdditionalDelay({
                localAdditionalMrpDelay: Millis(0),
                peerAdditionalMrpDelay: undefined,
                network: unlimitedThrottle(),
            });

            expect(captured).equals(Millis(0));
        });
    });
});
