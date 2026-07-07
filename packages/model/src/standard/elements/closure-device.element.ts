/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const ClosureDt = DeviceType(
    { name: "Closure", id: 0x230, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 560, revision: 1 } ], element: "attribute" }),
        Requirement({ name: "TAGLIST", conformance: "M", element: "feature" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "WindowCovering", id: 0x102, conformance: "X", element: "serverCluster" }),
    Requirement({ name: "ClosureControl", id: 0x104, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "ClosureDimension", id: 0x105, conformance: "X", element: "serverCluster" }),
    Requirement({ name: "DoorLock", id: 0xa, conformance: "O", element: "deviceType" }),
    Requirement({ name: "OnOffLight", id: 0x100, conformance: "O", element: "deviceType" }),
    Requirement({ name: "ClosurePanel", id: 0x231, conformance: "O", element: "deviceType" })
);

MatterDefinition.children.push(ClosureDt);
