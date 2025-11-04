/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "PowerTopology", pics: "PWRTL", xref: "core§11.8",
    details: "The Power Topology Cluster provides a mechanism for expressing how power is flowing between " +
        "endpoints.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "core§11.8.4",

            children: [
                {
                    tag: "field", name: "NODE",
                    details: "This endpoint provides or consumes power to/from the entire node"
                },
                {
                    tag: "field", name: "TREE",
                    details: "This endpoint provides or consumes power to/from itself and its child endpoints"
                },
                {
                    tag: "field", name: "SET",
                    details: "This endpoint provides or consumes power to/from a specified set of endpoints"
                },
                { tag: "field", name: "DYPF", details: "The specified set of endpoints may change" }
            ]
        },

        {
            tag: "attribute", name: "AvailableEndpoints", xref: "core§11.8.5.1",
            details: "Indicates the list of endpoints capable of providing power to and/or consuming power from the " +
                "endpoint hosting this server."
        },

        {
            tag: "attribute", name: "ActiveEndpoints", xref: "core§11.8.5.2",
            details: "Indicates the current list of endpoints currently providing or consuming power to or from the " +
                "endpoint hosting this server. This list shall be a subset of the value of the AvailableEndpoints " +
                "attribute."
        }
    ]
});
