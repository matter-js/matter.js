/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MRP } from "#protocol/MRP.js";
import { SessionParameters } from "#session/SessionParameters.js";
import { ChannelType, Seconds } from "@matter/general";

describe("MRP", () => {
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
        });
    });
});
