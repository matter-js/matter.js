#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This example shows how to create a Air Quality Sensor Matter device with temperature, humidity, PMx and TVOC
 * measurements.  It just defines initial static values, so it won't change over time.
 */

import { Endpoint, ServerNode } from "@matter/main";
import { Pm1ConcentrationMeasurementServer } from "@matter/main/behaviors/pm1-concentration-measurement";
import { Pm10ConcentrationMeasurementServer } from "@matter/main/behaviors/pm10-concentration-measurement";
import { Pm25ConcentrationMeasurementServer } from "@matter/main/behaviors/pm25-concentration-measurement";
import { RelativeHumidityMeasurementServer } from "@matter/main/behaviors/relative-humidity-measurement";
import { TemperatureMeasurementServer } from "@matter/main/behaviors/temperature-measurement";
import { TotalVolatileOrganicCompoundsConcentrationMeasurementServer } from "@matter/main/behaviors/total-volatile-organic-compounds-concentration-measurement";
import { AirQuality } from "@matter/main/clusters/air-quality";
import { ConcentrationMeasurement } from "@matter/main/clusters/concentration-measurement";
import { AirQualitySensorDevice } from "@matter/main/devices/air-quality-sensor";

// Define the endpoint for the device.  This is the "thing/device" that will appear on the network.
const airQualityEndpoint = new Endpoint(
    AirQualitySensorDevice.with(
        TemperatureMeasurementServer,
        RelativeHumidityMeasurementServer,
        Pm1ConcentrationMeasurementServer.with(ConcentrationMeasurement.Feature.NumericMeasurement),
        Pm25ConcentrationMeasurementServer.with(ConcentrationMeasurement.Feature.NumericMeasurement),
        Pm10ConcentrationMeasurementServer.with(ConcentrationMeasurement.Feature.NumericMeasurement),
        TotalVolatileOrganicCompoundsConcentrationMeasurementServer.with(
            ConcentrationMeasurement.Feature.NumericMeasurement,
        ),
    ),
    {
        id: "airQuality",
        airQuality: {
            airQuality: AirQuality.AirQualityEnum.Poor,
        },
        relativeHumidityMeasurement: {
            tolerance: 0,
            minMeasuredValue: 0,
            maxMeasuredValue: 100,
        },
        temperatureMeasurement: {
            tolerance: 0,
            minMeasuredValue: 0,
            maxMeasuredValue: 100,
        },
        pm1ConcentrationMeasurement: {
            measuredValue: 12.34,
            measurementUnit: ConcentrationMeasurement.MeasurementUnit.Ppm,
            measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
        },
        pm10ConcentrationMeasurement: {
            measuredValue: 12.34,
            measurementUnit: ConcentrationMeasurement.MeasurementUnit.Ppm,
            measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
        },
        pm25ConcentrationMeasurement: {
            measuredValue: 12.34,
            measurementUnit: ConcentrationMeasurement.MeasurementUnit.Ppm,
            measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
        },
        totalVolatileOrganicCompoundsConcentrationMeasurement: {
            measuredValue: 12.34,
            measurementUnit: ConcentrationMeasurement.MeasurementUnit.Ppm,
            measurementMedium: ConcentrationMeasurement.MeasurementMedium.Air,
        },
    },
);

// Physical devices appear as "nodes" on a Matter network.  As a device implementer you use a NodeServer to bring a
// device online.
//
// Note there are a large number of options to NodeServer that we are allowing to take default values here.  See
// IlluminatedRollerShade.ts for a more detailed example.
const node = await ServerNode.create();

// Nodes are a composition of endpoints.  Add a single endpoint to the node, our example socket device.
await node.add(airQualityEndpoint);
// Our device is now built, so we can bring the node online.
//
// Note that you may serve multiple nodes from a single process.  We only have one, however, so we can use the run()
// method of the node.
await node.run();
