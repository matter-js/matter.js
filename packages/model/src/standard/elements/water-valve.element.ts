/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const WaterValveDt = DeviceType(
    { name: "WaterValve", id: 0x42, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 66, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "ValveConfigurationAndControl", id: 0x81, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "FlowMeasurement", id: 0x404, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "FlowMeasurement", id: 0x404, conformance: "O", element: "clientCluster" })
);

MatterDefinition.children.push(WaterValveDt);
