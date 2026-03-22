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

export const ElectricalEnergyTariffDt = DeviceType(
    { name: "ElectricalEnergyTariff", id: 0x513, classification: "simple" },
    Requirement(
        { name: "Descriptor", id: 0x1d, element: "serverCluster" },
        Requirement({ name: "DeviceTypeList", default: [ { deviceType: 1299, revision: 1 } ], element: "attribute" })
    ),
    Requirement({ name: "CommodityPrice", id: 0x95, conformance: "[ActiveTariff].a+", element: "serverCluster" }),
    Requirement({ name: "ElectricalGridConditions", id: 0xa0, conformance: "O", element: "serverCluster" }),
    Requirement({ name: "CommodityTariff", id: 0x700, conformance: "O.a+", element: "serverCluster" }),
    Condition({ name: "ActiveTariff" })
);

MatterDefinition.children.push(ElectricalEnergyTariffDt);
