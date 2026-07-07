/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const ElectricalUtilityMeterDt = DeviceType(
    { name: "ElectricalUtilityMeter", id: 0x511, type: "MeterReferencePoint", classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 1297, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "TimeSyncCond", type: "RootNode.TimeSyncCond", conformance: "M", element: "condition" }),
    Requirement({ name: "MeterIdentification", id: 0xb06, conformance: "M", element: "serverCluster" })
);

MatterDefinition.children.push(ElectricalUtilityMeterDt);
