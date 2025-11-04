/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const RoboticVacuumCleanerDt = DeviceType(
    { name: "RoboticVacuumCleaner", id: 0x74, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 116, revision: 4 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "RvcRunMode", id: 0x54, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "RvcCleanMode", id: 0x55, conformance: "O", element: "serverCluster" }),
    Requirement(
        { name: "RvcOperationalState", id: 0x61, conformance: "M", element: "serverCluster" },
        Requirement({ name: "OperationCompletion", conformance: "M", element: "event" })
    ),
    Requirement({ name: "ServiceArea", id: 0x150, conformance: "O", element: "serverCluster" })
);

MatterDefinition.children.push(RoboticVacuumCleanerDt);
