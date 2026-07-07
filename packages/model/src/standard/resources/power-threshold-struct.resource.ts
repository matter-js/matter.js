/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "PowerThresholdStruct", xref: "cluster§9.1.6",
    details: "This struct represents information about a power threshold.",

    children: [
        {
            tag: "field", name: "PowerThreshold", xref: "cluster§9.1.6.1",
            details: "This field shall indicate the instantaneous power demand that can be distributed to the customer " +
                "without any risk of overload. The value is in mW and could be provided by the contract or " +
                "Distribution Network Operator (DNO)."
        },

        {
            tag: "field", name: "ApparentPowerThreshold", xref: "cluster§9.1.6.2",
            details: "This field shall indicate the instantaneous apparent power demand that can be distributed to the " +
                "customer without any risk of overload. The value is in mVA and could be provided by the contract or " +
                "Distribution Network Operator (DNO)."
        },

        {
            tag: "field", name: "PowerThresholdSource", xref: "cluster§9.1.6.3",
            details: "This field shall indicate the reason why the PowerThreshold field was set. If the reason is " +
                "unavailable, this field shall be null."
        }
    ]
});
