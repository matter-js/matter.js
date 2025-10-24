/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const NetworkInfrastructureManagerDt = DeviceType(
    { name: "NetworkInfrastructureManager", id: 0x90 },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 144, revision: 2 } ], element: "attribute" })
    ),
    Requirement({ name: "WiFiNetworkManagement", id: 0x451, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "ThreadBorderRouterManagement", id: 0x452, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "ThreadNetworkDirectory", id: 0x453, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "ThreadNetworkDiagnostics", id: 0x35, conformance: "M", element: "serverCluster" })
);

MatterDefinition.children.push(NetworkInfrastructureManagerDt);
