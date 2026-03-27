/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "CommodityMetering", pics: "COMMTR", xref: "cluster§9.11",
    details: "The Commodity Metering Cluster provides the mechanism for communicating commodity consumption " +
        "information within a premises.",

    children: [
        {
            tag: "attribute", name: "MeteredQuantity", xref: "cluster§9.11.5.1",
            details: "The most recent summed value of a commodity delivered to and consumed in the premises. A null value " +
                "indicates that metering data is currently unavailable."
        },
        {
            tag: "attribute", name: "MeteredQuantityTimestamp", xref: "cluster§9.11.5.2",
            details: "The timestamp in UTC for when the value of the MeteredQuantity attribute was last updated. A null " +
                "value indicates that metering data is currently unavailable."
        },
        {
            tag: "attribute", name: "TariffUnit", xref: "cluster§9.11.5.3",
            details: "Indicates the unit for the Quantity field on all MeteredQuantityStructs in the MeteredQuantity " +
                "attribute. A null value indicates that metering data is currently unavailable."
        },
        {
            tag: "attribute", name: "MaximumMeteredQuantities", xref: "cluster§9.11.5.4",
            details: "Indicates the maximum number of MeteredQuantityStructs in the MeteredQuantity attribute. A null " +
                "value indicates that metering data is currently unavailable."
        },

        {
            tag: "datatype", name: "MeteredQuantityStruct", xref: "cluster§9.11.4.1",
            details: "Provides access to the Electric Metering device’s readings.",

            children: [
                {
                    tag: "field", name: "TariffComponentIDs", xref: "cluster§9.11.4.1.1",
                    details: "Indicates the specific TariffComponentStructs associated with the metered commodity."
                },
                {
                    tag: "field", name: "Quantity", xref: "cluster§9.11.4.1.2",
                    details: "This field indicates the amount of a commodity metered during the associated TariffComponentStructs."
                }
            ]
        }
    ]
});
