/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const SecondaryNetworkInterfaceDt = DeviceType(
    { name: "SecondaryNetworkInterface", id: 0x19 },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 25, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "NetworkCommissioning", id: 0x31, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "EthernetNetworkDiagnostics", id: 0x37, conformance: "[Ethernet]", element: "serverCluster" }),
    Requirement({ name: "WiFiNetworkDiagnostics", id: 0x36, conformance: "[WiFi]", element: "serverCluster" }),
    Requirement({ name: "ThreadNetworkDiagnostics", id: 0x35, conformance: "[Thread]", element: "serverCluster" })
);

MatterDefinition.children.push(SecondaryNetworkInterfaceDt);
