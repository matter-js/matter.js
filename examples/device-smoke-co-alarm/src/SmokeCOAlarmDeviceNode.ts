#!/usr/bin/env node
/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This example shows how to create a simple Smoke&CO Sensor Matter device.  It just defines initial static values,
 * so it won't change over time.
 */

import { Endpoint, ServerNode } from "@matter/main";
import { CarbonDioxideConcentrationMeasurementServer } from "@matter/main/behaviors/carbon-dioxide-concentration-measurement";
import { SmokeCoAlarmServer } from "@matter/main/behaviors/smoke-co-alarm";
import { ConcentrationMeasurement } from "@matter/main/clusters/concentration-measurement";
import { SmokeCoAlarmDevice } from "@matter/main/devices/smoke-co-alarm";

// Define the endpoint for the device.  This is the "thing/device" that will appear on the network.
const smokeCoAlarmEndpoint = new Endpoint(
    SmokeCoAlarmDevice.with(
        CarbonDioxideConcentrationMeasurementServer.with("NumericMeasurement", "PeakMeasurement", "AverageMeasurement"),
        SmokeCoAlarmServer.with("SmokeAlarm", "CoAlarm"),
    ),
    {
        id: "smokeCoAlarm",
        smokeCoAlarm: {
            /*
            The following values are set as defaults by the SmokeCoAlarmServer class.  You can override them here.
            expressedState: SmokeCoAlarm.ExpressedState.Normal,
            smokeState: SmokeCoAlarm.AlarmState.Normal,
            coState: SmokeCoAlarm.AlarmState.Normal,
            batteryAlert: SmokeCoAlarm.AlarmState.Normal,
            testInProgress: false,
            hardwareFaultAlert: false,
            endOfServiceAlert: SmokeCoAlarm.EndOfService.Normal,
             */
        },
        carbonDioxideConcentrationMeasurement: {
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
await node.add(smokeCoAlarmEndpoint);
// Our device is now built, so we can bring the node online.
//
// Note that you may serve multiple nodes from a single process.  We only have one, however, so we can use the run()
// method of the node.
await node.run();
