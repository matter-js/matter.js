/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const RoomAirConditionerDt = DeviceType(
    { name: "RoomAirConditioner", id: 0x72 },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 114, revision: 2 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "Groups", id: 0x4, conformance: "O", element: "serverCluster" }),
    Requirement(
        { name: "OnOff", id: 0x6, conformance: "M", element: "serverCluster" },
        Requirement({ name: "DEADFRONTBEHAVIOR", conformance: "M", element: "feature" })
    ),
    Requirement({ name: "ScenesManagement", id: 0x62, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "Thermostat", id: 0x201, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "FanControl", id: 0x202, conformance: "O", element: "serverCluster" }),
    Requirement(
        { name: "ThermostatUserInterfaceConfiguration", id: 0x204, conformance: "O", element: "serverCluster" },
        Requirement({ name: "KeypadLockout", conformance: "O", element: "attribute" })
    ),
    Requirement({ name: "TemperatureMeasurement", id: 0x402, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "RelativeHumidityMeasurement", id: 0x405, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "TemperatureSensor", id: 0x302, conformance: "O", element: "deviceType" }),
    Requirement({ name: "HumiditySensor", id: 0x307, conformance: "O", element: "deviceType" })
);

MatterDefinition.children.push(RoomAirConditionerDt);
