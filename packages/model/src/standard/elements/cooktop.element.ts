/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const CooktopDt = DeviceType(
    { name: "Cooktop", id: 0x78 },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 120, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "serverCluster" }),
    Requirement(
        { name: "OnOff", id: 0x6, conformance: "M", element: "serverCluster" },
        Requirement({ name: "OFFONLY", conformance: "M", element: "feature" })
    ),
    Requirement({ name: "CookSurface", id: 0x77, conformance: "O", element: "deviceType" })
);

MatterDefinition.children.push(CooktopDt);
