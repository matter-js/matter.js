/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const SnapshotCameraDt = DeviceType(
    { name: "SnapshotCamera", id: 0x145, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 325, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "PowerSourceCond", type: "RootNode.PowerSourceCond", conformance: "M", element: "condition" }),
    Requirement(
        { name: "TimeSyncWithTzCond", type: "RootNode.TimeSyncWithTzCond", conformance: "M", element: "condition" }
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "OccupancySensing", id: 0x406, conformance: "O", element: "serverCluster" }),
    Requirement(
        { name: "ZoneManagement", id: 0x550, conformance: "O", element: "serverCluster" },
        Requirement({ name: "TWODIMENSIONALCARTESIANZONE", conformance: "M", element: "feature" })
    ),

    Requirement(
        { name: "CameraAvStreamManagement", id: 0x551, conformance: "M", element: "serverCluster" },
        Requirement({ name: "SNAPSHOT", conformance: "M", element: "feature" }),
        Requirement({ name: "VIDEO", conformance: "X", element: "feature" }),
        Requirement({ name: "AUDIO", conformance: "X", element: "feature" })
    ),

    Requirement({ name: "CameraAvSettingsUserLevelManagement", id: 0x552, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "OccupancySensor", id: 0x107, conformance: "O", element: "deviceType" })
);

MatterDefinition.children.push(SnapshotCameraDt);
