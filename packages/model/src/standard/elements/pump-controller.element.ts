/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const PumpControllerDt = DeviceType(
    { name: "PumpController", id: 0x304, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 772, revision: 4 } ], element: "attribute" })
    ),
    Requirement({ name: "OnOff", id: 0x6, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "PumpConfigurationAndControl", id: 0x200, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "Groups", id: 0x4, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "LevelControl", id: 0x8, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "ScenesManagement", id: 0x62, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "TemperatureMeasurement", id: 0x402, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "PressureMeasurement", id: 0x403, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "FlowMeasurement", id: 0x404, conformance: "O", element: "clientCluster" })
);

MatterDefinition.children.push(PumpControllerDt);
