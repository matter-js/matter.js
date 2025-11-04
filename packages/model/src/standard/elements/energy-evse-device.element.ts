/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const EnergyEvseDt = DeviceType(
    { name: "EnergyEvse", id: 0x50c, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 1292, revision: 2 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "EnergyEvse", id: 0x99, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "EnergyEvseMode", id: 0x9d, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "TemperatureMeasurement", id: 0x402, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "PowerSource", id: 0x11, conformance: "M", element: "deviceType" }),
    Requirement({ name: "ElectricalSensor", id: 0x510, conformance: "M", element: "deviceType" }),
    Requirement({ name: "DeviceEnergyManagement", id: 0x50d, conformance: "M", element: "deviceType" })
);

MatterDefinition.children.push(EnergyEvseDt);
