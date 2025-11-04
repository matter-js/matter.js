/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    DeviceTypeElement as DeviceType,
    RequirementElement as Requirement,
    FieldElement as Field
} from "../../elements/index.js";

export const BasicVideoPlayerDt = DeviceType(
    { name: "BasicVideoPlayer", id: 0x28, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 40, revision: 2 } ], element: "attribute" })
    ),
    Requirement({ name: "OnOff", id: 0x6, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "WakeOnLan", id: 0x503, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "Channel", id: 0x504, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "TargetNavigator", id: 0x505, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "MediaPlayback", id: 0x506, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "MediaInput", id: 0x507, conformance: "PhysicalInputs", element: "serverCluster" }),
    Requirement({ name: "LowPower", id: 0x508, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "KeypadInput", id: 0x509, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "AudioOutput", id: 0x50b, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "ContentControl", id: 0x50f, conformance: "P, O", element: "serverCluster" }),
    Requirement({ name: "Messages", id: 0x97, conformance: "O", element: "serverCluster" }),
    Field({ name: "conditions", type: "enum8" }, Field({ name: "PhysicalInputs" }))
);

MatterDefinition.children.push(BasicVideoPlayerDt);
