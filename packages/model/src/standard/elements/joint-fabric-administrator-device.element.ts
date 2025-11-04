/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const JointFabricAdministratorDt = DeviceType(
    { name: "JointFabricAdministrator", id: 0x130, classification: "utility" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 304, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "JointFabricDatastore", id: 0x752, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "JointFabricAdministrator", id: 0x753, conformance: "M", element: "serverCluster" })
);

MatterDefinition.children.push(JointFabricAdministratorDt);
