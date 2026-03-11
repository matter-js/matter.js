/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PhysicalDeviceProperties } from "#peer/PhysicalDeviceProperties.js";
import { Instant, Minutes, Seconds } from "@matter/general";

const { subscriptionIntervalBoundsFor } = PhysicalDeviceProperties;

/** Minimal properties for a standard mains-powered WiFi device. */
const BASE_PROPERTIES: PhysicalDeviceProperties = {
    supportsThread: false,
    supportsWifi: true,
    supportsEthernet: false,
    rootEndpointServerList: [],
    isMainsPowered: true,
    isBatteryPowered: false,
    isIntermittentlyConnected: false,
    isThreadSleepyEndDevice: false,
};

describe("PhysicalDeviceProperties", () => {
    describe("subscriptionIntervalBoundsFor", () => {
        describe("minIntervalFloor", () => {
            it("defaults to 1 second when called with no arguments", () => {
                const { minIntervalFloor } = subscriptionIntervalBoundsFor();

                expect(minIntervalFloor).to.equal(Seconds(1));
            });

            it("defaults to 1 second for a non-ICD device with no floor requested", () => {
                const { minIntervalFloor } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, isIntermittentlyConnected: false },
                });

                expect(minIntervalFloor).to.equal(Seconds(1));
            });

            it("respects a custom floor requested for a non-ICD device", () => {
                const { minIntervalFloor } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, isIntermittentlyConnected: false },
                    request: { minIntervalFloor: Seconds(30) },
                });

                expect(minIntervalFloor).to.equal(Seconds(30));
            });

            it("is always Instant (0) for an ICD device even when no floor is requested", () => {
                const { minIntervalFloor } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, isIntermittentlyConnected: true },
                });

                expect(minIntervalFloor).to.equal(Instant);
            });

            it("overwrites a non-zero requested floor to Instant (0) for an ICD device", () => {
                const { minIntervalFloor } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, isIntermittentlyConnected: true },
                    request: { minIntervalFloor: Seconds(30) },
                });

                expect(minIntervalFloor).to.equal(Instant);
            });

            it("keeps Instant (0) for an ICD device when the requested floor is already Instant", () => {
                const { minIntervalFloor } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, isIntermittentlyConnected: true },
                    request: { minIntervalFloor: Instant },
                });

                expect(minIntervalFloor).to.equal(Instant);
            });
        });

        describe("maxIntervalCeiling", () => {
            it("defaults to 1 minute with no properties", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor();

                expect(maxIntervalCeiling).to.equal(Minutes(1));
            });

            it("uses 1 minute for a WiFi device", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, supportsWifi: true },
                });

                expect(maxIntervalCeiling).to.equal(Minutes(1));
            });

            it("uses 1 minute for a Thread device that is not sleepy", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, supportsThread: true, isThreadSleepyEndDevice: false },
                });

                expect(maxIntervalCeiling).to.equal(Minutes(1));
            });

            it("uses 3 minutes for a Thread sleepy end device", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, supportsThread: true, isThreadSleepyEndDevice: true },
                });

                expect(maxIntervalCeiling).to.equal(Minutes(3));
            });

            it("uses 10 minutes for a battery-powered device", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, isBatteryPowered: true, isMainsPowered: false },
                });

                expect(maxIntervalCeiling).to.equal(Minutes(10));
            });

            it("uses non-battery ceiling when device is both battery and mains powered", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, isBatteryPowered: true, isMainsPowered: true },
                });

                expect(maxIntervalCeiling).to.equal(Minutes(1));
            });

            it("respects an explicitly requested ceiling", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    request: { maxIntervalCeiling: Seconds(45) },
                });

                expect(maxIntervalCeiling).to.equal(Seconds(45));
            });

            it("applies ±5% jitter to the ceiling when Thread is active", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, supportsThread: true, threadActive: true },
                });

                // 5% of Minutes(1) = ±3 seconds, result rounded to whole seconds
                expect(maxIntervalCeiling).to.be.at.least(Seconds(57));
                expect(maxIntervalCeiling).to.be.at.most(Seconds(63));
            });

            it("does not apply jitter when Thread is not active", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, supportsThread: true, threadActive: false },
                });

                expect(maxIntervalCeiling).to.equal(Minutes(1));
            });

            it("does not apply jitter when Thread is active for ICD device with Instant floor", () => {
                const { minIntervalFloor, maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: {
                        ...BASE_PROPERTIES,
                        isIntermittentlyConnected: true,
                        supportsThread: true,
                        threadActive: true,
                    },
                });

                expect(minIntervalFloor).to.equal(Instant);
                expect(maxIntervalCeiling).to.be.at.least(Seconds(57));
                expect(maxIntervalCeiling).to.be.at.most(Seconds(63));
            });
        });
    });
});
