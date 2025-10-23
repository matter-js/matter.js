/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CarbonDioxideConcentrationMeasurementServer } from "#behaviors/carbon-dioxide-concentration-measurement";
import { CarbonMonoxideConcentrationMeasurementServer } from "#behaviors/carbon-monoxide-concentration-measurement";
import { ConcentrationMeasurement } from "#clusters/concentration-measurement";
import { FanControl } from "#clusters/fan-control";
import { AirPurifierDevice } from "#devices/air-purifier";
import { Endpoint } from "#endpoint/Endpoint.js";
import { MockServerNode } from "../../node/mock-server-node.js";

const fanControl = {
    fanModeSequence: FanControl.FanModeSequence.OffHigh,
    percentCurrent: 50,
};

describe("ConcentrationMeasurementServer", () => {
    it("supports numeric measurement mode", async () => {
        const node = await MockServerNode.create();
        const Co2MeasurementServer = CarbonDioxideConcentrationMeasurementServer.with("NumericMeasurement");

        const PurifierDevice = AirPurifierDevice.with(Co2MeasurementServer);
        const purifier = new Endpoint(PurifierDevice, {
            fanControl,
            carbonDioxideConcentrationMeasurement: {
                measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
                measurementUnit: ConcentrationMeasurement.MeasurementUnit.Ppm,
            },
        });

        await node.add(purifier);

        await purifier.set({
            carbonDioxideConcentrationMeasurement: {
                measuredValue: 4,
            },
        });
    });

    it("supports level indication mode", async () => {
        const node = await MockServerNode.create();
        const CoMeasurementServer = CarbonDioxideConcentrationMeasurementServer.with("LevelIndication");

        const PurifierDevice = AirPurifierDevice.with(CoMeasurementServer);
        const purifier = new Endpoint(PurifierDevice, {
            fanControl,
            carbonDioxideConcentrationMeasurement: {
                levelValue: ConcentrationMeasurement.LevelValue.Unknown,
                measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
            },
        });

        await node.add(purifier);

        await purifier.set({
            carbonDioxideConcentrationMeasurement: {
                levelValue: ConcentrationMeasurement.LevelValue.High,
            },
        });
    });

    it("supports one value mode with sibling with different value mode", async () => {
        const node = await MockServerNode.create();
        const Co2MeasurementServer = CarbonDioxideConcentrationMeasurementServer.with("NumericMeasurement");
        const CoMeasurementServer = CarbonMonoxideConcentrationMeasurementServer.with("LevelIndication");

        const PurifierDevice = AirPurifierDevice.with(Co2MeasurementServer, CoMeasurementServer);
        const purifier = new Endpoint(PurifierDevice, {
            fanControl,

            carbonDioxideConcentrationMeasurement: {
                measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
                measurementUnit: ConcentrationMeasurement.MeasurementUnit.Ppm,
            },

            carbonMonoxideConcentrationMeasurement: {
                levelValue: ConcentrationMeasurement.LevelValue.Unknown,
                measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
            },
        });

        await node.add(purifier);

        await purifier.set({
            carbonDioxideConcentrationMeasurement: {
                measuredValue: 4,
            },

            carbonMonoxideConcentrationMeasurement: {
                levelValue: ConcentrationMeasurement.LevelValue.High,
            },
        });
    });
});
