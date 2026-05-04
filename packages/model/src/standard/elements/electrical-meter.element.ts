/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import { DeviceTypeElement as DeviceType, RequirementElement as Requirement } from "../../elements/index.js";

export const ElectricalMeterDt = DeviceType(
    { name: "ElectricalMeter", id: 0x514, type: "ElectricalEnergyTariff", classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 1300, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "CommodityMetering", id: 0xb07, conformance: "P, M", element: "serverCluster" }),
    Requirement({ name: "ElectricalPowerMeasurement", id: 0x90, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "ElectricalEnergyMeasurement", id: 0x91, conformance: "M", element: "serverCluster" }),
    Requirement({ name: "ElectricalSensor", id: 0x510, conformance: "M", element: "deviceType" })
);

MatterDefinition.children.push(ElectricalMeterDt);
