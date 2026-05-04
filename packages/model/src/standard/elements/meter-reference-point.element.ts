/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    DeviceTypeElement as DeviceType,
    RequirementElement as Requirement,
    ConditionElement as Condition
} from "../../elements/index.js";

export const MeterReferencePointDt = DeviceType(
    { name: "MeterReferencePoint", id: 0x512, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 1298, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "TimeSyncCond", type: "RootNode.TimeSyncCond", conformance: "M", element: "condition" }),
    Requirement({ name: "Identify", id: 0x3, conformance: "M", element: "serverCluster" }),

    Requirement(
        { name: "ElectricalEnergyTariff", id: 0x513, conformance: "[ElectricalEnergy].a+", element: "deviceType" },
        Requirement(
            { name: "CommodityTariff", id: 0x700, element: "serverCluster" },
            Requirement({ name: "TariffUnit", conformance: "M", constraint: "kWh | kVAh", element: "attribute" })
        )
    ),

    Requirement({ name: "ElectricalMeter", id: 0x514, conformance: "[ElectricalEnergy].a+", element: "deviceType" }),
    Condition({ name: "ElectricalEnergy" })
);

MatterDefinition.children.push(MeterReferencePointDt);
