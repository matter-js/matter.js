/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from "#codec/MessageCodec.js";
import { NetworkProfile } from "#peer/NetworkProfile.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { MRP } from "#protocol/MRP.js";
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
            localFixedMrpBackoff: Millis(0),
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
    requiresAck?: boolean;
}): Message {
    return {
        packetHeader: { messageId: overrides?.messageId ?? 1 },
        payloadHeader: {
            protocolId: overrides?.protocolId ?? SECURE_CHANNEL_PROTOCOL_ID,
            messageType: overrides?.messageType ?? 1,
            exchangeId: 1,
            isInitiatorMessage: false,
            requiresAck: overrides?.requiresAck ?? false,
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

            const sendPromise = exchange.send(1, Bytes.empty);
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

    describe("liveness kick on duplicate", () => {
        before(() => {
            MockTime.enable();
            MockTime.forceMacrotasks = true;
        });
        after(() => {
            MockTime.forceMacrotasks = false;
        });

        // Both intervals are 7s so the base is 7s whether or not the peer counts as active, which puts the raw backoff
        // (7.7s at minimum) above the BDX cap — so the armed interval is exactly the 7.4s cap, and the margins below are
        // deterministic rather than jitter-dependent.
        const SLOW_PEER = { activeInterval: Seconds(7), idleInterval: Seconds(7), activeThreshold: Millis(200) };

        /**
         * Drives an exchange into the await-ack state, then delivers a duplicate of the message our pending send
         * answered.  Reports what reached the wire afterwards.
         */
        async function sendThenDuplicate(options: {
            protocolId?: number;
            /** Time to let elapse between our send and the duplicate. */
            gap: Duration;
            sessionParameters?: Partial<SessionParameters>;
            /** Deliver a duplicate of some other message instead of the one our send answered. */
            unrelatedDuplicate?: boolean;
            /** Consume retransmissions until only this many attempts remain before the budget is spent. */
            drainToRemainingAttempts?: number;
        }) {
            const protocolId = options.protocolId ?? BDX_PROTOCOL_ID;
            const channel = new ProtocolMocks.NetworkChannel({ index: 1 });
            channel.isReliable = false; // engage MRP so the send awaits an ack
            const session = new ProtocolMocks.NodeSession({
                channel,
                sessionParameters: options.sessionParameters ?? SLOW_PEER,
            });

            const payloadSends = new Array<number>();
            let standaloneAcks = 0;
            (session.channel as any).send = async (message: Message): Promise<void> => {
                const { protocolId: sentProtocol, messageType } = message.payloadHeader;
                if (SecureMessageType.isStandaloneAck(sentProtocol, messageType)) {
                    standaloneAcks++;
                } else {
                    payloadSends.push(message.packetHeader.messageId);
                }
            };

            const { exchange } = createExchange(session, protocolId);

            // The peer message our send answers, so the pending message carries its id as ackedMessageId
            const query = fakeInboundMessage({ messageId: 10, protocolId, requiresAck: true });
            await exchange.onMessageReceived(query);

            const sendPromise = exchange.send(1, Bytes.empty);
            // Pump until the send has landed and armed its retransmission timer, not merely registered the pending ack
            for (let i = 0; i < 20; i++) {
                await MockTime.yield3();
            }
            expect(exchange.hasUnackedMessage).to.be.true;

            if (options.drainToRemainingAttempts !== undefined) {
                const target = MRP.MAX_TRANSMISSIONS - options.drainToRemainingAttempts;
                for (let i = 0; i < 200 && exchange.retransmissionCount < target; i++) {
                    await MockTime.advance(Seconds(8));
                    await MockTime.yield3();
                }
                expect(exchange.retransmissionCount).equals(target);
            }

            const sendsBefore = payloadSends.length;
            const acksBefore = standaloneAcks;

            await MockTime.advance(options.gap);
            await MockTime.yield3();

            const duplicated = options.unrelatedDuplicate
                ? fakeInboundMessage({ messageId: 99, protocolId, requiresAck: true })
                : query;
            await exchange.onMessageReceived(duplicated, true);
            await MockTime.yield3();

            const result = {
                retransmissions: payloadSends.length - sendsBefore,
                standaloneAcks: standaloneAcks - acksBefore,
            };

            // Ack so the send settles rather than dangling on the retransmission loop
            await exchange.onMessageReceived(
                fakeInboundMessage({ messageId: 11, protocolId, ackedMessageId: payloadSends[0] }),
            );
            // A drained exchange rejects with peer-unresponsive; either outcome is fine, we only need it settled
            await Promise.allSettled([sendPromise]);

            return result;
        }

        it("retransmits a BDX message when the peer re-asks for what it answers", async () => {
            const { retransmissions } = await sendThenDuplicate({ gap: Millis(7100) });
            expect(retransmissions).equals(1);
        });

        it("lets the retransmission carry the ack instead of sending a standalone one", async () => {
            const { standaloneAcks } = await sendThenDuplicate({ gap: Millis(7100) });
            expect(standaloneAcks).equals(0);
        });

        it("does not retransmit before the schedule's own cadence has elapsed", async () => {
            const { retransmissions, standaloneAcks } = await sendThenDuplicate({ gap: Millis(6500) });
            expect(retransmissions).equals(0);
            expect(standaloneAcks).equals(1);
        });

        it("does not retransmit when the peer can stay awake for the remaining wait", async () => {
            // A threshold above the wait the kick would cut means honouring the schedule costs nothing
            const { retransmissions, standaloneAcks } = await sendThenDuplicate({
                gap: Millis(7100),
                sessionParameters: { ...SLOW_PEER, activeThreshold: Millis(500) },
            });
            expect(retransmissions).equals(0);
            expect(standaloneAcks).equals(1);
        });

        it("acks rather than retransmitting once the retransmission budget is down to its last attempt", async () => {
            const { retransmissions, standaloneAcks } = await sendThenDuplicate({
                gap: Millis(7100),
                drainToRemainingAttempts: 1,
            });
            expect(retransmissions).equals(0);
            expect(standaloneAcks).equals(1);
        });

        it("does not retransmit for a non-BDX protocol", async () => {
            const { retransmissions, standaloneAcks } = await sendThenDuplicate({
                protocolId: SECURE_CHANNEL_PROTOCOL_ID,
                gap: Millis(7100),
            });
            expect(retransmissions).equals(0);
            expect(standaloneAcks).equals(1);
        });

        it("does not retransmit for a duplicate of an unrelated message", async () => {
            const { retransmissions, standaloneAcks } = await sendThenDuplicate({
                gap: Millis(7100),
                unrelatedDuplicate: true,
            });
            expect(retransmissions).equals(0);
            expect(standaloneAcks).equals(1);
        });
    });

    describe("retransmission timers do not outlive their message", () => {
        before(() => {
            MockTime.enable();
            MockTime.forceMacrotasks = true;
        });
        after(() => {
            MockTime.forceMacrotasks = false;
        });

        it("stops retransmitting when the ack arrives while a transmission is in flight", async () => {
            const channel = new ProtocolMocks.NetworkChannel({ index: 1 });
            channel.isReliable = false;
            const session = new ProtocolMocks.NodeSession({
                channel,
                sessionParameters: {
                    activeInterval: Seconds(1),
                    idleInterval: Seconds(1),
                    activeThreshold: Seconds(4),
                },
            });

            const payloadSends = new Array<number>();
            let releaseSend: (() => void) | undefined;
            (session.channel as any).send = async (message: Message): Promise<void> => {
                const { protocolId, messageType } = message.payloadHeader;
                if (SecureMessageType.isStandaloneAck(protocolId, messageType)) {
                    return;
                }
                payloadSends.push(message.packetHeader.messageId);
                // Hold the second transmission open so the ack lands while it is still in flight
                if (payloadSends.length === 2) {
                    await new Promise<void>(resolve => (releaseSend = resolve));
                }
            };

            const { exchange } = createExchange(session);
            const sendPromise = exchange.send(1, Bytes.empty);
            for (let i = 0; i < 20; i++) {
                await MockTime.yield3();
            }

            // Let the first retransmission start and block
            for (let i = 0; i < 20 && releaseSend === undefined; i++) {
                await MockTime.advance(Seconds(1));
                await MockTime.yield3();
            }
            expect(payloadSends.length).equals(2);

            // Ack while that transmission is still in flight, then let it complete
            await exchange.onMessageReceived(fakeInboundMessage({ messageId: 11, ackedMessageId: payloadSends[0] }));
            expect(exchange.hasUnackedMessage).to.be.false;
            releaseSend?.();
            await Promise.allSettled([sendPromise]);

            // Nothing is pending any more, so no timer may resurrect the message
            for (let i = 0; i < 10; i++) {
                await MockTime.advance(Seconds(60));
                await MockTime.yield3();
            }
            expect(payloadSends.length).equals(2);
        });
    });

    describe("BDX retransmission interval cap", () => {
        before(() => {
            MockTime.enable();
            MockTime.forceMacrotasks = true;
        });
        after(() => {
            MockTime.forceMacrotasks = false;
        });

        /** Counts retransmissions of one ack-requiring message within `window`. */
        async function retransmissionsWithin(options: {
            protocolId: number;
            window: Duration;
            localAdditionalMrpDelay: Duration;
            sessionParameters: Partial<SessionParameters>;
        }) {
            const channel = new ProtocolMocks.NetworkChannel({ index: 1 });
            channel.isReliable = false;
            const session = new ProtocolMocks.NodeSession({
                channel,
                sessionParameters: options.sessionParameters,
            });

            let payloadSends = 0;
            let sentMessageId: number | undefined;
            (session.channel as any).send = async (message: Message): Promise<void> => {
                const { protocolId, messageType } = message.payloadHeader;
                if (!SecureMessageType.isStandaloneAck(protocolId, messageType)) {
                    payloadSends++;
                    sentMessageId ??= message.packetHeader.messageId;
                }
            };

            const exchange = MessageExchange.initiate(
                {
                    session,
                    localSessionParameters: SessionParameters(SessionParameters.defaults),
                    localAdditionalMrpDelay: options.localAdditionalMrpDelay,
                    localFixedMrpBackoff: Millis(0),
                    async peerLost() {},
                    retry() {},
                },
                1,
                options.protocolId,
            );

            const sendPromise = exchange.send(1, Bytes.empty);
            for (let i = 0; i < 20; i++) {
                await MockTime.yield3();
            }
            expect(payloadSends).equals(1);

            for (let elapsed = 0; elapsed < options.window; elapsed += 500) {
                await MockTime.advance(Millis(500));
                await MockTime.yield3();
            }
            const retransmissions = payloadSends - 1;

            // Ack so the send settles rather than dangling on the retransmission loop
            await exchange.onMessageReceived(
                fakeInboundMessage({ messageId: 11, protocolId: options.protocolId, ackedMessageId: sentMessageId }),
            );
            await Promise.allSettled([sendPromise]);

            return retransmissions;
        }

        // A margin far beyond the cap, so an uncapped schedule cannot retransmit inside the window
        const PADDED = { localAdditionalMrpDelay: Seconds(20) };
        const FAST_PEER = { activeInterval: Millis(300), idleInterval: Millis(500), activeThreshold: Seconds(4) };

        it("retransmits a BDX message within the peer's response budget", async () => {
            // 30s budget / 4 retransmissions, less a margin for the last attempt to arrive = 7.4s per interval
            expect(
                await retransmissionsWithin({
                    protocolId: BDX_PROTOCOL_ID,
                    window: Seconds(8),
                    sessionParameters: FAST_PEER,
                    ...PADDED,
                }),
            ).equals(1);
        });

        it("leaves a non-BDX schedule uncapped", async () => {
            expect(
                await retransmissionsWithin({
                    protocolId: SECURE_CHANNEL_PROTOCOL_ID,
                    window: Seconds(8),
                    sessionParameters: FAST_PEER,
                    ...PADDED,
                }),
            ).equals(0);
        });

        it("caps a slow peer's idle cadence too, since a peer mid-transfer is not idle", async () => {
            // An idle threshold of 0 keeps the peer nominally idle, so the schedule would otherwise use its 20s idle
            // interval
            const SLEEPY = { activeInterval: Millis(300), idleInterval: Seconds(20), activeThreshold: Millis(0) };
            expect(
                await retransmissionsWithin({
                    protocolId: BDX_PROTOCOL_ID,
                    window: Seconds(8),
                    sessionParameters: SLEEPY,
                    localAdditionalMrpDelay: Millis(0),
                }),
            ).equals(1);
        });

        it("leaves a non-BDX slow peer on its idle cadence", async () => {
            const SLEEPY = { activeInterval: Millis(300), idleInterval: Seconds(20), activeThreshold: Millis(0) };
            expect(
                await retransmissionsWithin({
                    protocolId: SECURE_CHANNEL_PROTOCOL_ID,
                    window: Seconds(8),
                    sessionParameters: SLEEPY,
                    localAdditionalMrpDelay: Millis(0),
                }),
            ).equals(0);
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
            await exchange.send(0, Bytes.empty, { suppressAck: true, disableMrpLogic: true });

            expect(exchange.lastActive).to.equal(before + 2000);
        });
    });

    describe("close notification", () => {
        before(() => MockTime.enable());

        async function usedExchange() {
            const session = new ProtocolMocks.NodeSession();
            (session.channel as any).send = async (): Promise<void> => {};
            const { exchange } = createExchange(session);
            await exchange.send(0, Bytes.empty, { suppressAck: true, disableMrpLogic: true });
            return exchange;
        }

        it("emits closing once when close is invoked again after the exchange completed its close", async () => {
            const exchange = await usedExchange();
            let closingCount = 0;
            exchange.closing.on(() => {
                closingCount++;
            });

            await exchange.close();
            expect(exchange.closed.value).to.be.true;

            await exchange.close();

            expect(closingCount).to.equal(1);
        });

        it("emits closed once when destroyed after the exchange completed its close", async () => {
            const exchange = await usedExchange();
            let closedCount = 0;
            exchange.closed.on(() => {
                closedCount++;
            });

            await exchange.close();
            await exchange.destroy();

            expect(closedCount).to.equal(1);
        });

        // Characterization: destroy() bypasses the closing notification, which is why consumers that release
        // resources on close must observe both closing and closed
        it("emits closed but not closing when destroyed", async () => {
            const exchange = await usedExchange();
            let closingCount = 0;
            let closedCount = 0;
            exchange.closing.on(() => {
                closingCount++;
            });
            exchange.closed.on(() => {
                closedCount++;
            });

            await exchange.destroy();

            expect(closingCount).to.equal(0);
            expect(closedCount).to.equal(1);
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
                { suppressAck: true, disableMrpLogic: true },
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
            await exchange.send(0x10, new Uint8Array([0x00]), { suppressAck: true, disableMrpLogic: true });

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
            localFixedMrpBackoff?: Duration;
            peerAdditionalMrpDelay?: Duration;
            sessionPeerAdditionalMrpDelay?: Duration;
            peerInitiated?: boolean;
            protocolId?: number;
            network?: NetworkProfile;
        }): Promise<{ additionalDelay?: Duration; fixedBackoff?: Duration }> {
            // MRP only engages on unreliable transports; the default mock channel is reliable.
            const channel = new ProtocolMocks.NetworkChannel({ index: 1 });
            channel.isReliable = false;
            const session = new ProtocolMocks.NodeSession({ channel });
            const captured: { additionalDelay?: Duration; fixedBackoff?: Duration } = {};
            (session.channel as any).getMrpResubmissionBackOffTime = (
                _retransmissionCount: number,
                _sessionParameters: unknown,
                _calculateMaximum: boolean,
                additionalDelay?: Duration,
                fixedBackoff?: Duration,
            ) => {
                captured.additionalDelay = additionalDelay;
                captured.fixedBackoff = fixedBackoff;
                throw new NetworkError("captured");
            };

            if (options.sessionPeerAdditionalMrpDelay !== undefined) {
                session.peerAdditionalMrpDelayResolver = () => options.sessionPeerAdditionalMrpDelay;
            }

            const context = {
                session,
                localSessionParameters: SessionParameters(SessionParameters.defaults),
                localAdditionalMrpDelay: options.localAdditionalMrpDelay,
                localFixedMrpBackoff: options.localFixedMrpBackoff ?? Millis(0),
                async peerLost() {},
                retry() {},
            };
            const exchangeOptions = {
                network: options.network,
                peerAdditionalMrpDelay: options.peerAdditionalMrpDelay,
            };

            const protocolId = options.protocolId ?? SECURE_CHANNEL_PROTOCOL_ID;
            const exchange = options.peerInitiated
                ? MessageExchange.fromInitialMessage(context, fakeInboundMessage({ protocolId }), exchangeOptions)
                : MessageExchange.initiate(context, 1, protocolId, exchangeOptions);

            await expect(exchange.send(1, Bytes.empty)).to.be.rejectedWith("captured");
            return captured;
        }

        it("uses peerAdditionalMrpDelay and ignores the throttle profile margin", async () => {
            const captured = await captureAdditionalDelay({
                localAdditionalMrpDelay: Millis(0),
                peerAdditionalMrpDelay: Seconds(1.5),
                network: unlimitedThrottle(),
            });

            expect(captured.additionalDelay).equals(Seconds(1.5));
        });

        it("falls back to localAdditionalMrpDelay as a floor when no peer margin is given", async () => {
            const captured = await captureAdditionalDelay({
                localAdditionalMrpDelay: Seconds(1.5),
                peerAdditionalMrpDelay: undefined,
                network: unlimitedThrottle(),
            });

            expect(captured.additionalDelay).equals(Seconds(1.5));
        });

        it("applies no margin when neither local nor peer margin is set", async () => {
            const captured = await captureAdditionalDelay({
                localAdditionalMrpDelay: Millis(0),
                peerAdditionalMrpDelay: undefined,
                network: unlimitedThrottle(),
            });

            expect(captured.additionalDelay).equals(Millis(0));
        });

        it("applies the session's peer margin to peer-initiated exchanges", async () => {
            const captured = await captureAdditionalDelay({
                localAdditionalMrpDelay: Millis(0),
                sessionPeerAdditionalMrpDelay: Seconds(1.5),
                peerInitiated: true,
            });

            expect(captured.additionalDelay).equals(Seconds(1.5));
        });

        it("applies the session's peer margin to initiated exchanges without an explicit margin", async () => {
            const captured = await captureAdditionalDelay({
                localAdditionalMrpDelay: Millis(0),
                sessionPeerAdditionalMrpDelay: Seconds(1.5),
            });

            expect(captured.additionalDelay).equals(Seconds(1.5));
        });

        it("prefers the explicit peer margin over the session's", async () => {
            const captured = await captureAdditionalDelay({
                localAdditionalMrpDelay: Millis(0),
                peerAdditionalMrpDelay: Millis(0),
                sessionPeerAdditionalMrpDelay: Seconds(1.5),
            });

            expect(captured.additionalDelay).equals(Millis(0));
        });

        it("passes localFixedMrpBackoff through as the fixed backoff pad, separate from additionalDelay", async () => {
            const captured = await captureAdditionalDelay({
                localAdditionalMrpDelay: Millis(0),
                localFixedMrpBackoff: Seconds(0.2),
                peerAdditionalMrpDelay: undefined,
            });

            expect(captured.fixedBackoff).equals(Seconds(0.2));
            expect(captured.additionalDelay).equals(Millis(0));
        });
    });
});
