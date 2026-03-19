/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const VideoDoorbellDt = DeviceType(
    { name: "VideoDoorbell", id: 0x143, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 323, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "Camera", id: 0x142, conformance: "M", element: "deviceType" }),
    Requirement({ name: "Doorbell", id: 0x148, conformance: "M", element: "deviceType" })
);

MatterDefinition.children.push(VideoDoorbellDt);
