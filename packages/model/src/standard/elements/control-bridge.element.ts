/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const ControlBridgeDt = DeviceType(
    { name: "ControlBridge", id: 0x840 },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 2112, revision: 3 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "Groups", id: 0x4, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "ScenesManagement", id: 0x62, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "OnOff", id: 0x6, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "LevelControl", id: 0x8, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "ColorControl", id: 0x300, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "IlluminanceMeasurement", id: 0x400, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "OccupancySensing", id: 0x406, conformance: "O", element: "clientCluster" })
);

MatterDefinition.children.push(ControlBridgeDt);
