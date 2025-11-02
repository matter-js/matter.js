/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const SmokeCoAlarmDt = DeviceType(
    { name: "SmokeCoAlarm", id: 0x76 },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 118, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "Groups", id: 0x4, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "SmokeCoAlarm", id: 0x5c, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "RelativeHumidityMeasurement", id: 0x405, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "TemperatureMeasurement", id: 0x402, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "CarbonMonoxideConcentrationMeasurement", id: 0x40c, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "PowerSource", id: 0x11, conformance: "M", element: "deviceType" })
);

MatterDefinition.children.push(SmokeCoAlarmDt);
