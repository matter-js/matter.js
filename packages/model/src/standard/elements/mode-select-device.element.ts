/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const ModeSelectDt = DeviceType(
    { name: "ModeSelect", id: 0x27, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 39, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "ModeSelect", id: 0x50, conformance: "M", element: "serverCluster" })
);

MatterDefinition.children.push(ModeSelectDt);
