/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const FanDt = DeviceType(
    { name: "Fan", id: 0x2b },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 43, revision: 3 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "Groups", id: 0x4, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "OnOff", id: 0x6, conformance: "O", element: "serverCluster" }),
    Requirement(
        { name: "FanControl", id: 0x202, conformance: "M", element: "serverCluster" },
        Requirement({ name: "FanModeSequence", access: "R V", conformance: "Matter", element: "attribute" })
    ),
    Requirement({ name: "Thermostat", id: 0x301, conformance: "O", element: "deviceType" })
);

MatterDefinition.children.push(FanDt);
