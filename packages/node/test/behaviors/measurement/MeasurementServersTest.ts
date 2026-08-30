/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FlowMeasurementServer } from "#behaviors/flow-measurement";
import { IlluminanceMeasurementServer } from "#behaviors/illuminance-measurement";
import { PressureMeasurementServer } from "#behaviors/pressure-measurement";
import { RelativeHumidityMeasurementServer } from "#behaviors/relative-humidity-measurement";
import { TemperatureMeasurementServer } from "#behaviors/temperature-measurement";
import { FlowSensorDevice } from "#devices/flow-sensor";
import { HumiditySensorDevice } from "#devices/humidity-sensor";
import { LightSensorDevice } from "#devices/light-sensor";
import { PressureSensorDevice } from "#devices/pressure-sensor";
import { TemperatureSensorDevice } from "#devices/temperature-sensor";
import { MockServerNode } from "@matter/node/testing";

const CASES = [
    { name: "TemperatureMeasurementServer", device: TemperatureSensorDevice, behavior: TemperatureMeasurementServer },
    { name: "IlluminanceMeasurementServer", device: LightSensorDevice, behavior: IlluminanceMeasurementServer },
    { name: "PressureMeasurementServer", device: PressureSensorDevice, behavior: PressureMeasurementServer },
    { name: "FlowMeasurementServer", device: FlowSensorDevice, behavior: FlowMeasurementServer },
    {
        name: "RelativeHumidityMeasurementServer",
        device: HumiditySensorDevice,
        behavior: RelativeHumidityMeasurementServer,
    },
] as const;

describe("measurement cluster servers", () => {
    for (const { name, device, behavior } of CASES) {
        it(`${name} reports an unavailable measurement range by default`, async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const ep = await node.add(device);

            const state = ep.stateOf(behavior);
            expect(state.minMeasuredValue).equals(null);
            expect(state.maxMeasuredValue).equals(null);
        });
    }

    describe("TemperatureMeasurementServer bounds", () => {
        it("refuses a maximum that does not exceed the minimum", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const ep = await node.add(TemperatureSensorDevice);

            await expect(
                ep.set({ temperatureMeasurement: { minMeasuredValue: 1000, maxMeasuredValue: 1000 } }),
            ).rejectedWith(/min minMeasuredValue \+ 1/);
        });

        it("refuses a measurement outside a stated range", async () => {
            await using node = await MockServerNode.createOnline(undefined, { device: undefined });
            const ep = await node.add(TemperatureSensorDevice, {
                temperatureMeasurement: { minMeasuredValue: -1000, maxMeasuredValue: 1000 },
            });

            await expect(ep.set({ temperatureMeasurement: { measuredValue: 1001 } })).rejectedWith(
                /minMeasuredValue to maxMeasuredValue/,
            );
        });
    });
});
