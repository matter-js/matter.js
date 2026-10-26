/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Message, SessionType } from "#codec/MessageCodec.js";
import { InitialContactSchedule } from "#peer/InitialContactSchedule.js";
import { PeerAckMissingError, PeerMessageMissingError } from "#peer/PeerCommunicationError.js";
import { PeerTimingParameters } from "#peer/PeerTimingParameters.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { MRP } from "#protocol/MRP.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { EXPECTED_CRYPTO_PROCESSING_TIME } from "#securechannel/SecureChannelMessenger.js";
import { SessionParameters } from "#session/SessionParameters.js";
import { Bytes, InternalError, Millis, Seconds, Time, Timestamp } from "@matter/general";
import { SECURE_CHANNEL_PROTOCOL_ID, SecureMessageType } from "@matter/types";

const timing = PeerTimingParameters();

const sigma2: Message = {
    packetHeader: {
        sessionId: 0,
        sessionType: SessionType.Unicast,
        hasPrivacyEnhancements: false,
        isControlMessage: false,
        hasMessageExtensions: false,
        messageId: 1,
    },
    payloadHeader: {
        exchangeId: 1,
        protocolId: SECURE_CHANNEL_PROTOCOL_ID,
        messageType: SecureMessageType.Sigma2,
        isInitiatorMessage: false,
        requiresAck: true,
        hasSecuredExtension: false,
    },
    payload: Bytes.empty,
};

interface Transmission {
    message: Message;
    at: Timestamp;
}

/**
 * Begins the next attempt of {@link schedule} and sends a never-acknowledged Sigma1 on it.  The mapping of the send
 * options mirrors what CaseClient does for Sigma1; the node-level connectivity test covers CaseClient itself.
 */
function sendSigma1(schedule: InitialContactSchedule, isDelayedFallback = false) {
    const attempt = schedule.begin(isDelayedFallback);
    const transmissions = new Array<Transmission>();

    const channel = new ProtocolMocks.NetworkChannel({ index: 1 });
    channel.isReliable = false; // engage MRP so the send retransmits while unacked
    const exchange = MessageExchange.initiate(
        {
            session: new ProtocolMocks.NodeSession({ channel }),
            localSessionParameters: SessionParameters(SessionParameters.defaults),
            localAdditionalMrpDelay: Millis(0),
            localFixedMrpBackoff: Millis(0),
            async peerLost() {},
            retry() {},
        },
        1,
        SECURE_CHANNEL_PROTOCOL_ID,
        {
            onSend: (message, retransmission) => {
                transmissions.push({ message, at: Time.nowUs });
                attempt.onSend(message, retransmission);
            },
            onReceive: attempt.onReceive,
        },
    );

    const { sendOptions } = attempt;
    const outcome = exchange
        .send(SecureMessageType.Sigma1, Bytes.empty, {
            expectedProcessingTime: EXPECTED_CRYPTO_PROCESSING_TIME,
            maxRetransmissions: sendOptions.maxInitialRetransmissions,
            maxRetransmissionTime: sendOptions.maxInitialRetransmissionTime,
            initialRetransmissionTime: sendOptions.initialRetransmissionTime,
            retransmissionTimeLimit: sendOptions.initialRetransmissionTimeLimit,
            backoffOffset: sendOptions.initialBackoffOffset,
        })
        .then(
            () => undefined,
            (error: unknown) => error,
        );
    return { attempt, exchange, transmissions, outcome };
}

/**
 * Advances time until {@link promise}, which must not reject, has settled.
 */
async function settle<T>(promise: Promise<T>) {
    let settled = false;
    const tracked = promise.then(result => {
        settled = true;
        return result;
    });
    for (let i = 0; i < 7200 && !settled; i++) {
        await MockTime.advance(Seconds(1));
        await MockTime.yield3();
    }
    expect(settled).true;
    return tracked;
}

/**
 * Advances time until {@link transmissions} has {@link count} entries.
 */
async function transmitted(transmissions: Transmission[], count = 1) {
    for (let i = 0; i < 10; i++) {
        await MockTime.yield3();
    }
    for (let i = 0; i < 3600 && transmissions.length < count; i++) {
        await MockTime.advance(Seconds(1));
        await MockTime.yield3();
    }
    expect(transmissions.length).greaterThanOrEqual(count);
}

function intervals(transmissions: Transmission[]) {
    return transmissions.slice(1).map((t, i) => t.at - transmissions[i].at);
}

describe("InitialContactSchedule", () => {
    before(() => MockTime.enable());
    afterEach(() => MockTime.reset());

    it("keeps one Sigma1 for the MRP budget and the retry delay, then continues the backoff with fresh ones", async () => {
        MockTime.reset();
        let unresponsive = 0;
        const schedule = new InitialContactSchedule(timing, () => unresponsive++);

        // Identical phase: one message, nothing sent after the maximum retry delay
        const identical = sendSigma1(schedule);
        expect(identical.attempt.isRefresh).false;
        const failure = await settle(identical.outcome);
        expect(PeerAckMissingError.of(failure)?.message).contains("did not acknowledge");
        expect(identical.transmissions.length).greaterThan(MRP.MAX_TRANSMISSIONS);
        expect(new Set(identical.transmissions.map(t => t.message.packetHeader.messageId)).size).equals(1);
        const firstAt = identical.transmissions[0].at;
        for (const { at } of identical.transmissions) {
            expect(at - firstAt).lessThan(timing.maxDelayBetweenInitialContactRetries);
        }
        expect(unresponsive).equals(1);
        await identical.exchange.destroy();
        expect(identical.attempt.fail(failure)).equals("switched");
        identical.attempt[Symbol.dispose]();

        // Refreshing phase: three transmissions per attempt, the backoff does not fall back to the base interval
        const lastIdenticalInterval = intervals(identical.transmissions).at(-1)!;
        let transmissions = identical.transmissions.length;
        for (let refresh = 0; refresh < 2; refresh++) {
            const fresh = sendSigma1(schedule);
            expect(fresh.attempt.isRefresh).true;
            expect(fresh.attempt.sendOptions.initialBackoffOffset).equals(transmissions);
            const freshFailure = await settle(fresh.outcome);
            expect(freshFailure).instanceOf(PeerAckMissingError);
            expect(fresh.transmissions.length).equals(3);
            for (const interval of intervals(fresh.transmissions)) {
                expect(interval).greaterThanOrEqual(Millis(lastIdenticalInterval * 0.8));
            }
            await fresh.exchange.destroy();
            expect(fresh.attempt.fail(freshFailure)).equals("refreshed");
            transmissions += fresh.transmissions.length;
        }

        // Retransmissions keep counting across attempts, so the signal does not repeat
        expect(unresponsive).equals(1);
    });

    it("keeps the MRP budget for a delayed fallback and counts retransmissions across attempts", async () => {
        MockTime.reset();
        let unresponsive = 0;
        const schedule = new InitialContactSchedule(timing, () => unresponsive++);

        const fallback = sendSigma1(schedule, true);
        expect(fallback.attempt.sendOptions.initialRetransmissionTime).equals(
            timing.maxDelayBetweenInitialContactRetries,
        );
        const failure = await settle(fallback.outcome);
        expect(failure).instanceOf(PeerAckMissingError);
        expect(fallback.transmissions.length).equals(MRP.MAX_TRANSMISSIONS);
        await fallback.exchange.destroy();

        // The MRP budget alone stays within the limit; the first retransmission of the fresh Sigma1 exceeds it
        expect(unresponsive).equals(0);
        fallback.attempt.fail(failure);
        const fresh = sendSigma1(schedule, true);
        await settle(fresh.outcome);
        await fresh.exchange.destroy();
        expect(unresponsive).equals(1);
    });

    describe("other ends of an attempt", () => {
        function switchedSchedule(onUnresponsive = () => {}) {
            const schedule = new InitialContactSchedule(timing, onUnresponsive);
            using first = schedule.begin(false);
            expect(first.fail(new PeerAckMissingError())).equals("switched");
            return schedule;
        }

        function expectIdenticalPhase(schedule: InitialContactSchedule) {
            using next = schedule.begin(false);
            expect(next.isRefresh).false;
            expect(next.sendOptions.maxInitialRetransmissions).equals(Infinity);
            expect(next.sendOptions.initialBackoffOffset).undefined;
        }

        it("returns to the identical phase when the peer answered", () => {
            const schedule = switchedSchedule();
            using answered = schedule.begin(false);
            answered.onReceive(sigma2, false);
            expect(answered.fail(new PeerAckMissingError())).undefined;
            expectIdenticalPhase(schedule);
        });

        it("returns to the identical phase on any other failure", () => {
            const schedule = switchedSchedule();
            using attempt = schedule.begin(false);
            expect(attempt.fail(new PeerMessageMissingError())).undefined;
            expectIdenticalPhase(schedule);
        });

        it("returns to the identical phase when the current attempt is disposed without a failure", () => {
            const schedule = switchedSchedule();
            schedule.begin(false)[Symbol.dispose]();
            expectIdenticalPhase(schedule);
        });

        it("keeps the phase when an attempt that already failed is disposed", () => {
            const schedule = new InitialContactSchedule(timing, () => {});
            const first = schedule.begin(false);
            first.fail(new PeerAckMissingError());
            first[Symbol.dispose]();

            using next = schedule.begin(false);
            expect(next.isRefresh).true;
        });

        it("refuses to begin an attempt while the previous one is open", () => {
            const schedule = switchedSchedule();
            using _open = schedule.begin(false);
            expect(() => schedule.begin(false)).throws(InternalError);
        });

        it("reports a restart for an unacknowledged Sigma1 that a kick restarted while it was failing", () => {
            const schedule = switchedSchedule();
            using attempt = schedule.begin(false);
            attempt.restart();
            expect(attempt.fail(new PeerAckMissingError())).equals("restarted");
            expectIdenticalPhase(schedule);
        });

        it("leaves any other failure of a restarted attempt to the usual handling", () => {
            const schedule = switchedSchedule();
            using attempt = schedule.begin(false);
            attempt.restart();
            expect(attempt.fail(new PeerMessageMissingError())).undefined;
            expectIdenticalPhase(schedule);
        });
    });

    it("signals unresponsiveness again after a restart, but not for transmissions of an ended attempt", async () => {
        MockTime.reset();
        let unresponsive = 0;
        const schedule = new InitialContactSchedule(timing, () => unresponsive++);

        const first = sendSigma1(schedule);
        await settle(first.outcome);
        await first.exchange.destroy();
        expect(unresponsive).equals(1);

        first.attempt.restart();
        first.attempt.onSend(first.transmissions[0].message, MRP.MAX_TRANSMISSIONS + 10);
        expect(unresponsive).equals(1);

        const second = sendSigma1(schedule);
        await settle(second.outcome);
        await second.exchange.destroy();
        expect(unresponsive).equals(2);
    });

    describe("kick blocker", () => {
        it("blocks until Sigma1 was retransmitted often enough", async () => {
            MockTime.reset();
            const schedule = new InitialContactSchedule(timing, () => {});
            const sending = sendSigma1(schedule);
            await transmitted(sending.transmissions);

            expect(sending.attempt.kickBlocker(sending.exchange, false)).equals("retransmissions");

            await sending.exchange.destroy();
            await settle(sending.outcome);
        });

        it("blocks once the peer answered", async () => {
            MockTime.reset();
            const schedule = new InitialContactSchedule(timing, () => {});
            const sending = sendSigma1(schedule, true);
            await transmitted(sending.transmissions, timing.kickMinRetransmissions + 1);
            expect(sending.attempt.kickBlocker(sending.exchange, false)).undefined;

            sending.attempt.onReceive(sigma2, false);
            expect(sending.attempt.kickBlocker(sending.exchange, false)).equals("answered");

            await sending.exchange.destroy();
            await settle(sending.outcome);
        });

        it("measures the saving against the schedule the restart would use", async () => {
            MockTime.reset();
            const schedule = new InitialContactSchedule(timing, () => {});
            const sending = sendSigma1(schedule, true);
            await transmitted(sending.transmissions, timing.kickMinRetransmissions + 1);

            // A promoted fallback restarts on the fast schedule, a fallback restarts just as slowly as before
            expect(sending.attempt.kickBlocker(sending.exchange, false)).undefined;
            expect(sending.attempt.kickBlocker(sending.exchange, true)).equals("saving");

            await sending.exchange.destroy();
            await settle(sending.outcome);
        });

        it("counts retransmissions across attempts and measures a refreshed exchange against the base schedule", async () => {
            MockTime.reset();
            const schedule = new InitialContactSchedule(timing, () => {});

            const identical = sendSigma1(schedule, true);
            identical.attempt.fail(await settle(identical.outcome));
            await identical.exchange.destroy();

            const fresh = sendSigma1(schedule, true);
            await transmitted(fresh.transmissions);
            expect(fresh.attempt.kickBlocker(fresh.exchange, false)).undefined;

            await fresh.exchange.destroy();
            await settle(fresh.outcome);
        });
    });
});
