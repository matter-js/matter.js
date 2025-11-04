/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const ElectricalSensorDt = DeviceType(
    { name: "ElectricalSensor", id: 0x510, classification: "utility" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 1296, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "PowerTopology", id: 0x9c, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "ElectricalPowerMeasurement", id: 0x90, conformance: "O.a+", element: "serverCluster" }),
    Requirement({ name: "ElectricalEnergyMeasurement", id: 0x91, conformance: "O.a+", element: "serverCluster" })
);

MatterDefinition.children.push(ElectricalSensorDt);
