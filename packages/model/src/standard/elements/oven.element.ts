/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const OvenDt = DeviceType(
    { name: "Oven", id: 0x7b },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 123, revision: 2 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "TemperatureControlledCabinet", id: 0x71, conformance: "M", element: "deviceType" }),
    Requirement({ name: "Cooktop", id: 0x78, conformance: "O", element: "deviceType" })
);

MatterDefinition.children.push(OvenDt);
