/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "Groupcast", pics: "GC",

    children: [
        {
            tag: "attribute", name: "FeatureMap",

            children: [
                { tag: "field", name: "LN", details: "Supports joining a multicast group of nodes as a listener." },
                {
                    tag: "field", name: "SD",
                    details: "Supports sending multicast message to a targeted group of nodes."
                },
                { tag: "field", name: "PGA", details: "Supports PerGroup multicast addresses." }
            ]
        },

        {
            tag: "datatype", name: "MulticastAddrPolicyEnum",

            children: [
                {
                    tag: "field", name: "IanaAddr",
                    details: "Group uses the IANA-assigned multicast address FF05::FA (default)."
                },
                {
                    tag: "field", name: "PerGroup",
                    details: "Group uses multicast address scoped to Fabric ID and Group ID."
                }
            ]
        }
    ]
});
