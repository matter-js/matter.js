/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PhysicalDeviceProperties } from "#peer/PhysicalDeviceProperties.js";
import { Instant, Seconds } from "@matter/general";

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
    isLongIdleTimeOperating: false,
    isThreadSleepyEndDevice: false,
};

describe("PhysicalDeviceProperties", () => {
    describe("isLongIdleTimeOperating", () => {
        it("defaults to false in BASE_PROPERTIES", () => {
            expect(BASE_PROPERTIES.isLongIdleTimeOperating).to.equal(false);
        });
    });

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
            // Up to +max(10%, 10s) one-sided jitter is always applied, floored to whole seconds.
            const expectJittered = (actual: number, baseSeconds: number) => {
                const window = Math.max(baseSeconds * 0.1, 10);
                expect(actual).to.be.at.least(Seconds(baseSeconds));
                expect(actual).to.be.at.most(Seconds(Math.floor(baseSeconds + window)));
            };

            it("defaults to 1 minute with no properties", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor();

                expectJittered(maxIntervalCeiling, 60);
            });

            it("uses 1 minute for a WiFi device", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, supportsWifi: true },
                });

                expectJittered(maxIntervalCeiling, 60);
            });

            it("uses 1 minute for a Thread device that is not sleepy", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, supportsThread: true, isThreadSleepyEndDevice: false },
                });

                expectJittered(maxIntervalCeiling, 60);
            });

            it("uses 3  for a Thread sleepy end device", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, supportsThread: true, isThreadSleepyEndDevice: true },
                });

                expectJittered(maxIntervalCeiling, 180);
            });

            it("uses 10 minutes for a battery-powered device", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, isBatteryPowered: true, isMainsPowered: false },
                });

                expectJittered(maxIntervalCeiling, 600);
            });

            it("uses non-battery ceiling when device is both battery and mains powered", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, isBatteryPowered: true, isMainsPowered: true },
                });

                expectJittered(maxIntervalCeiling, 60);
            });

            it("applies jitter to an explicitly requested ceiling", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    request: { maxIntervalCeiling: Seconds(45) },
                });

                expectJittered(maxIntervalCeiling, 45);
            });

            it("applies jitter regardless of network type", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, supportsThread: true, threadActive: true },
                });

                expectJittered(maxIntervalCeiling, 60);
            });

            it("applies jitter when Thread is not active", () => {
                const { maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, supportsThread: true, threadActive: false },
                });

                expectJittered(maxIntervalCeiling, 60);
            });

            it("applies jitter for an ICD device while keeping the Instant floor", () => {
                const { minIntervalFloor, maxIntervalCeiling } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, isIntermittentlyConnected: true },
                });

                expect(minIntervalFloor).to.equal(Instant);
                expectJittered(maxIntervalCeiling, 60);
            });
        });
    });
});
