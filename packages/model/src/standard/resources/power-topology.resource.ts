/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
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
            tag: "attribute", name: "AvailableEndpoints", xref: "core§11.8.6.1",
            details: "Indicates the list of endpoints capable of providing power to and/or consuming power from the " +
                "endpoint hosting this server."
        },

        {
            tag: "attribute", name: "ActiveEndpoints", xref: "core§11.8.6.2",
            details: "Indicates the current list of endpoints currently providing or consuming power to or from the " +
                "endpoint hosting this server. This list shall be a subset of the value of the AvailableEndpoints " +
                "attribute."
        },

        {
            tag: "datatype", name: "CircuitNodeStruct", xref: "core§11.8.5.1",
            details: "This indicates a device on the circuit represented by this server.",

            children: [
                {
                    tag: "field", name: "Node", xref: "core§11.8.5.1.1",
                    details: "This field shall indicate the ID of a node which is on the electrical circuit represented by this " +
                        "server."
                },
                {
                    tag: "field", name: "Endpoint", xref: "core§11.8.5.1.2",
                    details: "This field shall indicate the endpoint ID of the indicated node which is on the electrical circuit " +
                        "represented by this server."
                },
                {
                    tag: "field", name: "Label", xref: "core§11.8.5.1.3",
                    details: "This field shall indicate a friendly name for the node, to be used when the client does not have " +
                        "access to the node's fabric."
                }
            ]
        }
    ]
});
