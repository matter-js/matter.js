/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const HeatPumpDt = DeviceType(
    { name: "HeatPump", id: 0x309, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 777, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "Thermostat", id: 0x201, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "PowerSource", id: 0x11, conformance: "M", element: "deviceType" }),
    Requirement(
        { name: "Thermostat", id: 0x301, conformance: "O", element: "deviceType" },
        Requirement({ name: "UserLabel", id: 0x41, conformance: "M", element: "serverCluster" })
    ),
    Requirement({ name: "TemperatureSensor", id: 0x302, conformance: "O", element: "deviceType" }),
    Requirement({ name: "DeviceEnergyManagement", id: 0x50d, conformance: "M", element: "deviceType" }),
    Requirement({ name: "WaterHeater", id: 0x50f, conformance: "O", element: "deviceType" }),
    Requirement(
        { name: "ElectricalSensor", id: 0x510, conformance: "M", element: "deviceType" },
        Requirement({ name: "ElectricalPowerMeasurement", id: 0x90, conformance: "M", element: "serverCluster" }),
        Requirement({ name: "ElectricalEnergyMeasurement", id: 0x91, conformance: "M", element: "serverCluster" })
    )
);

MatterDefinition.children.push(HeatPumpDt);
