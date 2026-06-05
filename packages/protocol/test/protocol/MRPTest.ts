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

        function runtimeRangeFor(baseInterval: number, transmissionNumber: number) {
            const deterministic =
                (baseInterval + MRP.ADDITIONAL_MRP_DELAY) *
                MRP.BACKOFF_MARGIN *
                Math.pow(MRP.BACKOFF_BASE, Math.max(0, transmissionNumber - MRP.BACKOFF_THRESHOLD));
            return { min: Math.floor(deterministic), max: Math.floor(deterministic * (1 + MRP.BACKOFF_JITTER)) };
        }

        function expectWithin(value: number, { min, max }: { min: number; max: number }) {
            expect(value).to.be.at.least(min);
            expect(value).to.be.at.most(max);
        }

        it("uses the idle interval for the first transmission even when the peer is active", () => {
            const interval = MRP.retransmissionIntervalOf({
                transmissionNumber: 0,
                sessionParameters,
                isPeerActive: true,
            });

            expectWithin(interval, runtimeRangeFor(Seconds(10), 0));
        });

        it("uses the active interval for retransmissions while the peer is active", () => {
            const interval = MRP.retransmissionIntervalOf({
                transmissionNumber: 1,
                sessionParameters,
                isPeerActive: true,
            });

            expectWithin(interval, runtimeRangeFor(Millis(500), 1));
        });

        it("uses the idle interval for retransmissions when the peer is no longer active", () => {
            const interval = MRP.retransmissionIntervalOf({
                transmissionNumber: 1,
                sessionParameters,
                isPeerActive: false,
            });

            expectWithin(interval, runtimeRangeFor(Seconds(10), 1));
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

        it("uses the idle interval for the first transmission even when the peer is active", () => {
            const interval = MRP.maxRetransmissionIntervalOf({
                transmissionNumber: 0,
                sessionParameters,
                isPeerActive: true,
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
