/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const TemperatureSensorDt = DeviceType(
    { name: "TemperatureSensor", id: 0x302, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 770, revision: 2 } ], element: "attribute" })
    ),
    Requirement({ name: "TemperatureMeasurement", id: 0x402, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" })
);

MatterDefinition.children.push(TemperatureSensorDt);
