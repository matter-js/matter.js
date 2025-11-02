/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const WaterHeaterDt = DeviceType(
    { name: "WaterHeater", id: 0x50f },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 1295, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "serverCluster" }),
    Requirement(
        { name: "Thermostat", id: 0x201, conformance: "M", element: "serverCluster" },
        Requirement({ name: "HEATING", conformance: "M", element: "feature" })
    ),
    Requirement({ name: "WaterHeaterManagement", id: 0x94, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "WaterHeaterMode", id: 0x9e, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "PowerSource", id: 0x11, conformance: "O", element: "deviceType" }),
    Requirement({ name: "TemperatureSensor", id: 0x302, conformance: "O", element: "deviceType" }),
    Requirement({ name: "ElectricalSensor", id: 0x510, conformance: "desc", element: "deviceType" }),
    Requirement({ name: "DeviceEnergyManagement", id: 0x50d, conformance: "O", element: "deviceType" })
);

MatterDefinition.children.push(WaterHeaterDt);
