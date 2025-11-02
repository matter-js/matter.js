/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const ExtractorHoodDt = DeviceType(
    { name: "ExtractorHood", id: 0x7a },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 122, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "HepaFilterMonitoring", id: 0x71, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "ActivatedCarbonFilterMonitoring", id: 0x72, conformance: "O", element: "serverCluster" }),

    Requirement(
        { name: "FanControl", id: 0x202, conformance: "M", element: "serverCluster" },
        Requirement({ name: "ROCKING", conformance: "X", element: "feature" }),
        Requirement({ name: "WIND", conformance: "X", element: "feature" }),
        Requirement({ name: "AIRFLOWDIRECTION", conformance: "X", element: "feature" })
    ),

    Requirement({ name: "OnOffLight", id: 0x100, conformance: "O", element: "deviceType" })
);

MatterDefinition.children.push(ExtractorHoodDt);
