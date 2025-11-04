/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const FlowSensorDt = DeviceType(
    { name: "FlowSensor", id: 0x306, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 774, revision: 2 } ], element: "attribute" })
    ),
    Requirement({ name: "FlowMeasurement", id: 0x404, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" })
);

MatterDefinition.children.push(FlowSensorDt);
