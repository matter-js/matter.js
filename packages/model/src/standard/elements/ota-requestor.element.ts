/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const OtaRequestorDt = DeviceType(
    { name: "OtaRequestor", id: 0x12, classification: "utility" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 18, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "OtaSoftwareUpdateRequestor", id: 0x2a, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "OtaSoftwareUpdateProvider", id: 0x29, conformance: "M", element: "clientCluster" })
);

MatterDefinition.children.push(OtaRequestorDt);
