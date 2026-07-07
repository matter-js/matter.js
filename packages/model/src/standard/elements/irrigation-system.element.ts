/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const IrrigationSystemDt = DeviceType(
    { name: "IrrigationSystem", id: 0x40, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 64, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "OperationalState", id: 0x60, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "FlowMeasurement", id: 0x404, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "FlowMeasurement", id: 0x404, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "WaterValve", id: 0x42, conformance: "M", element: "deviceType" })
);

MatterDefinition.children.push(IrrigationSystemDt);
