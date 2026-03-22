/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    DeviceTypeElement as DeviceType,
    RequirementElement as Requirement,
    ConditionElement as Condition
} from "../../elements/index.js";

export const DeviceEnergyManagementDt = DeviceType(
    { name: "DeviceEnergyManagement", id: 0x50d, classification: "utility" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 1293, revision: 3 } ], element: "attribute" })
    ),

    Requirement(
        { name: "DeviceEnergyManagement", id: 0x98, conformance: "M", element: "serverCluster" },
        Requirement({ name: "POWERADJUSTMENT", conformance: "[ControllableESA].a+", element: "feature" }),
        Requirement({ name: "STARTTIMEADJUSTMENT", conformance: "[ControllableESA].a+", element: "feature" }),
        Requirement({ name: "PAUSABLE", conformance: "[ControllableESA].a+", element: "feature" }),
        Requirement({ name: "FORECASTADJUSTMENT", conformance: "[ControllableESA].a+", element: "feature" }),
        Requirement({ name: "CONSTRAINTBASEDADJUSTMENT", conformance: "[ControllableESA].a+", element: "feature" })
    ),

    Requirement(
        { name: "DeviceEnergyManagementMode", id: 0x9f, conformance: "ControllableESA, O", element: "serverCluster" }
    ),
    Requirement({ name: "ElectricalGridConditions", id: 0xa0, conformance: "O", element: "clientCluster" }),
    Condition({ name: "ControllableEsa" })
);

MatterDefinition.children.push(DeviceEnergyManagementDt);
