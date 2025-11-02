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

export const BridgedNodeDt = DeviceType(
    { name: "BridgedNode", id: 0x13 },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 19, revision: 3 } ], element: "attribute" })
    ),
    Requirement({ name: "BridgedDeviceBasicInformation", id: 0x39, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "PowerSourceConfiguration", id: 0x2e, conformance: "BridgedPowerSourceInfo, D", element: "serverCluster" }),
    Requirement({ name: "PowerSource", id: 0x2f, conformance: "BridgedPowerSourceInfo", element: "serverCluster" }),
    Requirement(
        { name: "EcosystemInformation", id: 0x750, conformance: "FabricSynchronizedNode, O", element: "serverCluster" }
    ),
    Requirement({ name: "AdministratorCommissioning", id: 0x3c, conformance: "FabricSynchronizedNode", element: "serverCluster" }),
    Requirement({ name: "PowerSource", id: 0x11, conformance: "O", element: "deviceType" }),
    Field({ name: "conditions", type: "enum8" }, Field({ name: "FabricSynchronizedNode" }))
);

MatterDefinition.children.push(BridgedNodeDt);
