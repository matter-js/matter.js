/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Endpoint, ServerNode } from "@matter/main";
import {
    AirQualityServer,
    CarbonDioxideConcentrationMeasurementServer,
    RelativeHumidityMeasurementServer,
    TemperatureMeasurementServer,
} from "@matter/main/behaviors";
import { AirQuality, ConcentrationMeasurement } from "@matter/main/clusters";
import { AirQualitySensorDevice } from "@matter/main/devices/air-quality-sensor";
import { EndpointNumber } from "@matter/main/types";
import { registerDeviceType } from "./DeviceTypeRegistry.js";

// CO2 features follow the CDOCONC overrides in matter-js-pics.properties; CHIP's device also has LevelIndication.
const AirQualitySensor = AirQualitySensorDevice.with(
    AirQualityServer.with(
        AirQuality.Feature.Fair,
        AirQuality.Feature.Moderate,
        AirQuality.Feature.VeryPoor,
        AirQuality.Feature.ExtremelyPoor,
    ),
    TemperatureMeasurementServer,
    RelativeHumidityMeasurementServer,
    CarbonDioxideConcentrationMeasurementServer.with("NumericMeasurement", "PeakMeasurement", "AverageMeasurement"),
);

registerDeviceType({
    name: "air-quality-sensor",
    async create(serverNode: ServerNode, endpoint: EndpointNumber) {
        const ep = new Endpoint(AirQualitySensor, {
            number: endpoint,
            airQuality: { airQuality: AirQuality.AirQualityEnum.Fair },
            temperatureMeasurement: { measuredValue: 2500, minMeasuredValue: -5000, maxMeasuredValue: 10000 },
            relativeHumidityMeasurement: { measuredValue: 5000, minMeasuredValue: 0, maxMeasuredValue: 10000 },
            carbonDioxideConcentrationMeasurement: {
                measuredValue: 450,
                minMeasuredValue: 0,
                maxMeasuredValue: 5000,
                peakMeasuredValue: 600,
                peakMeasuredValueWindow: 3600,
                averageMeasuredValue: 500,
                averageMeasuredValueWindow: 3600,
                uncertainty: 0,
                measurementUnit: ConcentrationMeasurement.MeasurementUnit.Ppm,
                measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
            },
        });
        await serverNode.add(ep);
        return { endpoint: ep };
    },
});
