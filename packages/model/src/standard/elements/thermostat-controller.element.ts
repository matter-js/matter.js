/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const ThermostatControllerDt = DeviceType(
    { name: "ThermostatController", id: 0x30a },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 778, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "Identify", id: 0x3, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "Groups", id: 0x4, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "ScenesManagement", id: 0x62, conformance: "O", element: "clientCluster" }),
    Requirement({ name: "Thermostat", id: 0x201, conformance: "M", element: "clientCluster" })
);

MatterDefinition.children.push(ThermostatControllerDt);
