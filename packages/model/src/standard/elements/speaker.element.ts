/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const SpeakerDt = DeviceType(
    { name: "Speaker", id: 0x22, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 34, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "OnOff", id: 0x6, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "LevelControl", id: 0x8, conformance: "M", element: "serverCluster" })
);

MatterDefinition.children.push(SpeakerDt);
