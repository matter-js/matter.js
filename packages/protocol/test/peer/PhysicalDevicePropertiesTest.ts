/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { PhysicalDeviceProperties } from "#peer/PhysicalDeviceProperties.js";
import { Instant, Seconds } from "@matter/general";
import { GenericSwitchDt } from "@matter/model";
import { DeviceTypeId } from "@matter/types";

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
        // specificationVersion encoding for Matter 1.3.0.
        const SPEC_1_3 = 0x0103_0000;
        const THREAD_PRE_1_3: PhysicalDeviceProperties = {
            ...BASE_PROPERTIES,
            supportsWifi: false,
            supportsThread: true,
            threadActive: true,
        };

        describe("minIntervalFloor", () => {
            it("defaults to Instant (0) when called with no arguments", () => {
                const { minIntervalFloor } = subscriptionIntervalBoundsFor();

                expect(minIntervalFloor).to.equal(Instant);
            });

            it("defaults to Instant (0) for a non-Thread device with no floor requested", () => {
                const { minIntervalFloor } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, isIntermittentlyConnected: false },
                });

                expect(minIntervalFloor).to.equal(Instant);
            });

            it("uses 1 second for a pre-1.3 Thread device with no floor requested", () => {
                const { minIntervalFloor } = subscriptionIntervalBoundsFor({
                    properties: THREAD_PRE_1_3,
                });

                expect(minIntervalFloor).to.equal(Seconds(1));
            });

            it("uses 1 second for a Thread device that only supports Thread but is not yet active", () => {
                const { minIntervalFloor } = subscriptionIntervalBoundsFor({
                    properties: { ...BASE_PROPERTIES, supportsWifi: false, supportsThread: true },
                });

                expect(minIntervalFloor).to.equal(Seconds(1));
            });

            it("uses Instant (0) for a Thread device on Matter 1.3 or later", () => {
                const { minIntervalFloor } = subscriptionIntervalBoundsFor({
                    properties: { ...THREAD_PRE_1_3, specificationVersion: SPEC_1_3 },
                });

                expect(minIntervalFloor).to.equal(Instant);
            });

            it("uses Instant (0) for a pre-1.3 Thread device that has a Generic Switch endpoint", () => {
                const { minIntervalFloor } = subscriptionIntervalBoundsFor({
                    properties: { ...THREAD_PRE_1_3, deviceTypes: new Set([DeviceTypeId(GenericSwitchDt.id)]) },
                });

                expect(minIntervalFloor).to.equal(Instant);
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

            it("uses 3 minutes for a Thread sleepy end device", () => {
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
