/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "ElectricalEnergyTariff", xref: "device§14.7",
    details: "A Electrical Energy Tariff is a device that defines a tariff for the consumption or production of " +
        "electrical energy.",

    children: [
        { tag: "requirement", name: "CommodityPrice", xref: "device§14.7.4" },
        { tag: "requirement", name: "ElectricalGridConditions", xref: "device§14.7.4" },
        { tag: "requirement", name: "CommodityTariff", xref: "device§14.7.4" },
        {
            tag: "condition", name: "ActiveTariff",
            description: "The tariff represents the currently active tariff", xref: "device§14.7.3"
        }
    ]
});
