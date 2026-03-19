/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "MeterIdentification", pics: "MTRID", xref: "cluster§9.10",
    details: "This Meter Identification Cluster provides attributes for determining advanced information about " +
        "utility metering device.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§9.10.4",
            children: [{ tag: "field", name: "PWRTHLD", details: "Supports information about power threshold" }]
        },
        {
            tag: "attribute", name: "MeterType", xref: "cluster§9.10.6.1",
            details: "Indicates the Meter type features, decided by manufacturer. If the type is unavailable, this " +
                "attribute shall be null."
        },
        {
            tag: "attribute", name: "PointOfDelivery", xref: "cluster§9.10.6.2",
            details: "Indicates the unique identification of the connection point for the premises for billing purposes. " +
                "If the point of delivery is unavailable, this attribute shall be null."
        },
        {
            tag: "attribute", name: "MeterSerialNumber", xref: "cluster§9.10.6.3",
            details: "Indicates the serial number of the meter. If the serial number is unavailable, this attribute shall " +
                "be null."
        },
        {
            tag: "attribute", name: "ProtocolVersion", xref: "cluster§9.10.6.4",
            details: "Indicates the underlying protocol version to express local market features. If the protocol version " +
                "is unavailable, this attribute shall be null."
        },
        { tag: "attribute", name: "PowerThreshold", xref: "cluster§9.10.6" },

        {
            tag: "datatype", name: "MeterTypeEnum", xref: "cluster§9.10.5.1",
            children: [
                { tag: "field", name: "Utility", description: "Utility Meter" },
                { tag: "field", name: "Private", description: "Private Meter" },
                { tag: "field", name: "Generic", description: "Generic Meter" }
            ]
        }
    ]
});
