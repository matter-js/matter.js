/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const ThreadBorderRouterDt = DeviceType(
    { name: "ThreadBorderRouter", id: 0x91, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 145, revision: 2 } ], element: "attribute" })
    ),
    Requirement({ name: "ThreadNetworkDiagnostics", id: 0x35, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "ThreadBorderRouterManagement", id: 0x452, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "ThreadNetworkDirectory", id: 0x453, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "SecondaryNetworkInterface", id: 0x19, conformance: "O", element: "deviceType" })
);

MatterDefinition.children.push(ThreadBorderRouterDt);
