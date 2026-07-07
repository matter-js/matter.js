/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "semanticNamespace", name: "CommodityTariffChronology", xref: "namespace§11",
    details: "The tags contained in this namespace are restricted for use in the energy calendar domain and shall " +
        "NOT be used in any other domain or context.",
    children: [
        { tag: "semanticTag", name: "Current", description: "Represents the current Commodity Tariff" },
        { tag: "semanticTag", name: "Previous", description: "Represents the previous Commodity Tariff" },
        { tag: "semanticTag", name: "Upcoming", description: "Represents the upcoming Commodity Tariff" }
    ]
});
