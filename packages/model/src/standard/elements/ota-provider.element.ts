/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const OtaProviderDt = DeviceType(
    { name: "OtaProvider", id: 0x14, classification: "utility" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 20, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "OtaSoftwareUpdateRequestor", id: 0x2a, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "OtaSoftwareUpdateProvider", id: 0x29, conformance: "M", element: "serverCluster" })
);

MatterDefinition.children.push(OtaProviderDt);
