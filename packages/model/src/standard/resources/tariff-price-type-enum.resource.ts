/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "TariffPriceTypeEnum", xref: "cluster§9.1.5",

    children: [
        {
            tag: "field", name: "Standard", description: "Standard tariff price", xref: "cluster§9.1.5.1",
            details: "This value shall indicate that a price comes from a standard tariff rate."
        },
        {
            tag: "field", name: "Critical", description: "Price during CPP events", xref: "cluster§9.1.5.2",
            details: "This value shall indicate that a price comes from a critical peak pricing event."
        },
        {
            tag: "field", name: "Virtual", description: "Price during VPP events", xref: "cluster§9.1.5.3",
            details: "This value shall indicate that a price comes from a virtual power plant event."
        },
        {
            tag: "field", name: "Incentive", description: "Price incentives", xref: "cluster§9.1.5.4",
            details: "This value shall indicate that a price comes from a incentive event."
        },
        {
            tag: "field", name: "IncentiveSignal", description: "Price incentive signals",
            xref: "cluster§9.1.5.5",
            details: "This value shall indicate that a price is synthesized from a non-tariff source; e.g. gCO2e/kWh."
        }
    ]
});
