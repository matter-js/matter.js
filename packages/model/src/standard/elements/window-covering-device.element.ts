/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const WindowCoveringDt = DeviceType(
    { name: "WindowCovering", id: 0x202, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 514, revision: 4 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "Groups", id: 0x4, conformance: "Active, O", element: "serverCluster" }),
    Requirement({ name: "WindowCovering", id: 0x102, conformance: "M", element: "serverCluster" })
);

MatterDefinition.children.push(WindowCoveringDt);
