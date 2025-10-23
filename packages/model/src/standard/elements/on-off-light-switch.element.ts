/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const OnOffLightSwitchDt = DeviceType(
    { name: "OnOffLightSwitch", id: 0x103 },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 259, revision: 3 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "Groups", id: 0x4, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "OnOff", id: 0x6, conformance: "M", element: "clientCluster" }),
    Requirement({ name: "ScenesManagement", id: 0x62, conformance: "O", element: "clientCluster" })
);

MatterDefinition.children.push(OnOffLightSwitchDt);
