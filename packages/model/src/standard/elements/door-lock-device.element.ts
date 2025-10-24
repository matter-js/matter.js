/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const DoorLockDt = DeviceType(
    { name: "DoorLock", id: 0xa },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 10, revision: 3 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "Groups", id: 0x4, conformance: "X", element: "serverCluster" }),
    Requirement({ name: "ScenesManagement", id: 0x62, conformance: "X", element: "serverCluster" }),
    Requirement(
        { name: "DoorLock", id: 0x101, conformance: "M", element: "serverCluster" },
        Requirement({ name: "USER", conformance: "PIN | RID | FGP | FACE | ALIRO", element: "feature" }),
        Requirement({ name: "RFIDCREDENTIAL", conformance: "P, O", element: "feature" })
    )
);

MatterDefinition.children.push(DoorLockDt);
