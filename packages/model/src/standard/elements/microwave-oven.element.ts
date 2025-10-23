/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const MicrowaveOvenDt = DeviceType(
    { name: "MicrowaveOven", id: 0x79 },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 121, revision: 2 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "serverCluster" }),
    Requirement(
        { name: "OperationalState", id: 0x60, conformance: "M", element: "serverCluster" },
        Requirement({ name: "CountdownTime", conformance: "M", element: "attribute" }),
        Requirement({ name: "OperationCompletion", conformance: "M", element: "event" })
    ),
    Requirement(
        { name: "FanControl", id: 0x202, conformance: "O", element: "serverCluster" },
        Requirement({ name: "WIND", conformance: "X", element: "feature" }),
        Requirement({ name: "AIRFLOWDIRECTION", conformance: "X", element: "feature" })
    ),
    Requirement({ name: "MicrowaveOvenMode", id: 0x5e, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "MicrowaveOvenControl", id: 0x5f, conformance: "M", element: "serverCluster" })
);

MatterDefinition.children.push(MicrowaveOvenDt);
