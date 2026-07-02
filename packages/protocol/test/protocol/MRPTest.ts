/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MRP } from "#protocol/MRP.js";
import { SessionParameters } from "#session/SessionParameters.js";
import { ChannelType, Millis, Seconds } from "@matter/general";

describe("MRP", () => {
    describe("retransmissionIntervalOf", () => {
        // Distinct intervals so idle- and active-based results cannot overlap, even with jitter
        const sessionParameters = SessionParameters({
            idleInterval: Seconds(10),
            activeInterval: Millis(500),
        });

        const ADDITIONAL = Seconds(1.5);

        const FIXED = Seconds(0.2);

        function runtimeRangeFor(baseInterval: number, transmissionNumber: number, additional = 0, fixed = 0) {
            // additionalDelay joins the base interval and is therefore amplified by margin/exponent; fixed is a flat
            // pad added after the backoff (the jitter window shifts by a constant, it is not scaled).
            const amplified =
                (baseInterval + additional) *
                MRP.BACKOFF_MARGIN *
                Math.pow(MRP.BACKOFF_BASE, Math.max(0, transmissionNumber - MRP.BACKOFF_THRESHOLD));
            return {
                min: Math.floor(amplified) + fixed,
                max: Math.floor(amplified * (1 + MRP.BACKOFF_JITTER)) + fixed,
            };
        }

        function expectWithin(value: number, { min, max }: { min: number; max: number }) {
            expect(value).to.be.at.least(min);
            expect(value).to.be.at.most(max);
        }

        it("uses the active interval for the first transmission when the peer is active", () => {
            const interval = MRP.retransmissionIntervalOf({
                transmissionNumber: 0,
                sessionParameters,
                isPeerActive: true,
                additionalDelay: ADDITIONAL,
            });

            expectWithin(interval, runtimeRangeFor(Millis(500), 0, ADDITIONAL));
        });

        it("uses the idle interval for the first transmission when the peer is inactive", () => {
            const interval = MRP.retransmissionIntervalOf({
                transmissionNumber: 0,
                sessionParameters,
                isPeerActive: false,
                additionalDelay: ADDITIONAL,
            });

            expectWithin(interval, runtimeRangeFor(Seconds(10), 0, ADDITIONAL));
        });

        it("uses the active interval for retransmissions while the peer is active", () => {
            const interval = MRP.retransmissionIntervalOf({
                transmissionNumber: 1,
                sessionParameters,
                isPeerActive: true,
                additionalDelay: ADDITIONAL,
            });

            expectWithin(interval, runtimeRangeFor(Millis(500), 1, ADDITIONAL));
        });

        it("uses the idle interval for retransmissions when the peer is no longer active", () => {
            const interval = MRP.retransmissionIntervalOf({
                transmissionNumber: 1,
                sessionParameters,
                isPeerActive: false,
                additionalDelay: ADDITIONAL,
            });

            expectWithin(interval, runtimeRangeFor(Seconds(10), 1, ADDITIONAL));
        });

        it("adds no margin when additionalDelay is omitted", () => {
            const interval = MRP.retransmissionIntervalOf({
                transmissionNumber: 0,
                sessionParameters,
                isPeerActive: true,
            });

            expectWithin(interval, runtimeRangeFor(Millis(500), 0, 0));
        });

        it("adds fixedBackoff as a flat pad after the backoff, not amplified by the exponent", () => {
            // The fixed pad must shift the window by a constant at every transmission, never scaled by the
            // exponent — contrast additionalDelay above, which is amplified because it joins the base interval.
            for (const transmissionNumber of [0, 1, 4]) {
                const interval = MRP.retransmissionIntervalOf({
                    transmissionNumber,
                    sessionParameters,
                    isPeerActive: true,
                    fixedBackoff: FIXED,
                });

                expectWithin(interval, runtimeRangeFor(Millis(500), transmissionNumber, 0, FIXED));
            }
        });

        it("applies additionalDelay (amplified) and fixedBackoff (flat) independently", () => {
            const interval = MRP.retransmissionIntervalOf({
                transmissionNumber: 2,
                sessionParameters,
                isPeerActive: true,
                additionalDelay: ADDITIONAL,
                fixedBackoff: FIXED,
            });

            expectWithin(interval, runtimeRangeFor(Millis(500), 2, ADDITIONAL, FIXED));
        });
    });

    describe("maxRetransmissionIntervalOf", () => {
        const sessionParameters = SessionParameters({
            idleInterval: Seconds(10),
            activeInterval: Millis(500),
        });

        function maximumFor(baseInterval: number, transmissionNumber: number) {
            return Math.floor(
                baseInterval *
                    MRP.BACKOFF_MARGIN *
                    Math.pow(MRP.BACKOFF_BASE, Math.max(0, transmissionNumber - MRP.BACKOFF_THRESHOLD)) *
                    (1 + MRP.BACKOFF_JITTER),
            );
        }

        it("uses the active interval for the first transmission when the peer is active", () => {
            const interval = MRP.maxRetransmissionIntervalOf({
                transmissionNumber: 0,
                sessionParameters,
                isPeerActive: true,
            });

            expect(interval).to.equal(maximumFor(Millis(500), 0));
        });

        it("uses the idle interval for the first transmission when the peer is inactive", () => {
            const interval = MRP.maxRetransmissionIntervalOf({
                transmissionNumber: 0,
                sessionParameters,
                isPeerActive: false,
            });

            expect(interval).to.equal(maximumFor(Seconds(10), 0));
        });

        it("uses the idle interval for retransmissions when the peer is not active", () => {
            const interval = MRP.maxRetransmissionIntervalOf({
                transmissionNumber: 1,
                sessionParameters,
                isPeerActive: false,
            });

            expect(interval).to.equal(maximumFor(Seconds(10), 1));
        });

        it("uses the active interval for retransmissions when the peer is active", () => {
            const interval = MRP.maxRetransmissionIntervalOf({
                transmissionNumber: 1,
                sessionParameters,
                isPeerActive: true,
            });

            expect(interval).to.equal(maximumFor(Millis(500), 1));
        });
    });

    describe("maxPeerResponseTimeOf", () => {
        const localSessionParameters = SessionParameters();

        describe("BLE channel", () => {
            it("uses the 30s base when expectedProcessingTime is small", () => {
                const timeout = MRP.maxPeerResponseTimeOf({
                    localSessionParameters,
                    channelType: ChannelType.BLE,
                    isPeerActive: true,
                    expectedProcessingTime: Seconds(2),
                });

                expect(timeout).to.equal(Seconds(35));
            });

            it("honors expectedProcessingTime when larger than the 30s base", () => {
                const timeout = MRP.maxPeerResponseTimeOf({
                    localSessionParameters,
                    channelType: ChannelType.BLE,
                    isPeerActive: true,
                    expectedProcessingTime: Seconds(60),
                });

                expect(timeout).to.equal(Seconds(65));
            });

            it("falls back to the default expectedProcessingTime when omitted", () => {
                const timeout = MRP.maxPeerResponseTimeOf({
                    localSessionParameters,
                    channelType: ChannelType.BLE,
                    isPeerActive: true,
                });

                expect(timeout).to.equal(Seconds(35));
            });
        });

        describe("UDP channel", () => {
            // Both legs use SessionIntervals defaults (idle 500ms, active 300ms, threshold 4000ms). The numbers are
            // the deterministic maximum-backoff sums for five transmissions, so the first transmission of each leg now
            // honors PeerActiveMode (active leg starts at 300ms, idle leg at 500ms).
            it("composes the active peer leg, the active return leg, processing time and buffer", () => {
                const timeout = MRP.maxPeerResponseTimeOf({
                    peerSessionParameters: SessionParameters(),
                    localSessionParameters,
                    channelType: ChannelType.UDP,
                    isPeerActive: true,
                });

                // 4229 (peer, active) + 4229 (return, active) + 2000 (processing) + 5000 (buffer)
                expect(timeout).to.equal(Millis(15458));
            });

            it("uses the idle peer leg when the peer is inactive while the return leg stays active", () => {
                const timeout = MRP.maxPeerResponseTimeOf({
                    peerSessionParameters: SessionParameters(),
                    localSessionParameters,
                    channelType: ChannelType.UDP,
                    isPeerActive: false,
                });

                // 7050 (peer, idle) + 4229 (return, active) + 2000 (processing) + 5000 (buffer)
                expect(timeout).to.equal(Millis(18279));
            });

            it("drops the peer leg when peer session parameters are unknown", () => {
                const timeout = MRP.maxPeerResponseTimeOf({
                    localSessionParameters,
                    channelType: ChannelType.UDP,
                    isPeerActive: true,
                });

                // 4229 (return, active) + 2000 (processing) + 5000 (buffer)
                expect(timeout).to.equal(Millis(11229));
            });
        });

        describe("TCP channel", () => {
            it("uses the 30s base when expectedProcessingTime is small", () => {
                const timeout = MRP.maxPeerResponseTimeOf({
                    localSessionParameters,
                    channelType: ChannelType.TCP,
                    isPeerActive: true,
                    expectedProcessingTime: Seconds(2),
                });

                expect(timeout).to.equal(Seconds(35));
            });

            it("honors expectedProcessingTime when larger than the 30s base", () => {
                const timeout = MRP.maxPeerResponseTimeOf({
                    localSessionParameters,
                    channelType: ChannelType.TCP,
                    isPeerActive: true,
                    expectedProcessingTime: Seconds(60),
                });

                expect(timeout).to.equal(Seconds(65));
            });

            it("falls back to the default expectedProcessingTime when omitted", () => {
                const timeout = MRP.maxPeerResponseTimeOf({
                    localSessionParameters,
                    channelType: ChannelType.TCP,
                    isPeerActive: true,
                });

                expect(timeout).to.equal(Seconds(35));
            });
        });
    });
});
