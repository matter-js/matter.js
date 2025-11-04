/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "ResourceMonitoring", pics: "REPM", xref: "cluster§2.8",

    details: "This generic cluster provides an interface to the current condition of a resource. A resource is a " +
        "component of a device that is designed to be replaced, refilled, or emptied when exhausted or full. " +
        "Examples of resources include filters, cartridges, and water tanks. While batteries fit this " +
        "definition they are not intended to be used with this cluster. Use the power source cluster for " +
        "batteries instead." +
        "\n" +
        "> [!NOTE]" +
        "\n" +
        "> This cluster is not meant to be used for monitoring of the system resources, such as processing, " +
        "  memory utilization, networking properties, etc." +
        "\n" +
        "This cluster shall be used via an alias to a specific resource type (see Cluster IDs).",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§2.8.4",

            children: [
                {
                    tag: "field", name: "CON",
                    details: "Supports monitoring the condition of the resource in percentage"
                },
                { tag: "field", name: "WRN", details: "Supports warning indication" },
                { tag: "field", name: "REP", details: "Supports specifying the list of replacement products" }
            ]
        },

        {
            tag: "attribute", name: "Condition", xref: "cluster§2.8.6.1",
            details: "Indicates the current condition of the resource in percent."
        },
        {
            tag: "attribute", name: "DegradationDirection", xref: "cluster§2.8.6.2",
            details: "Indicates the direction of change for the condition of the resource over time, which helps to " +
                "determine whether a higher or lower condition value is considered optimal."
        },
        {
            tag: "attribute", name: "ChangeIndication", xref: "cluster§2.8.6.3",
            details: "This attribute shall be populated with a value from ChangeIndicationEnum that is indicative of the " +
                "current requirement to change the resource."
        },
        {
            tag: "attribute", name: "InPlaceIndicator", xref: "cluster§2.8.6.4",
            details: "Indicates whether a resource is currently installed. A value of true shall indicate that a resource " +
                "is installed. A value of false shall indicate that a resource is not installed."
        },
        {
            tag: "attribute", name: "LastChangedTime", xref: "cluster§2.8.6.5",
            details: "This attribute may indicates the time at which the resource has been changed, if supported by the " +
                "server. The attribute shall be null if it was never set or is unknown."
        },
        {
            tag: "attribute", name: "ReplacementProductList", xref: "cluster§2.8.6.6",
            details: "Indicates the list of supported products that may be used as replacements for the current resource. " +
                "Each item in this list represents a unique ReplacementProductStruct."
        },

        {
            tag: "command", name: "ResetCondition", xref: "cluster§2.8.7.1",
            details: "Upon receipt, the device shall reset the Condition and ChangeIndicator attributes, indicating full " +
                "resource availability and readiness for use, as initially configured. Invocation of this command may " +
                "cause the LastChangedTime to be updated automatically based on the clock of the server, if the " +
                "server supports setting the attribute."
        },

        {
            tag: "datatype", name: "DegradationDirectionEnum", xref: "cluster§2.8.5.1",
            details: "Indicates the direction in which the condition of the resource changes over time.",

            children: [
                {
                    tag: "field", name: "Up",
                    description: "The degradation of the resource is indicated by an upwards moving/increasing value"
                },
                {
                    tag: "field", name: "Down",
                    description: "The degradation of the resource is indicated by a downwards moving/decreasing value"
                }
            ]
        },

        {
            tag: "datatype", name: "ChangeIndicationEnum", xref: "cluster§2.8.5.2",

            children: [
                { tag: "field", name: "Ok", description: "Resource is in good condition, no intervention required" },
                {
                    tag: "field", name: "Warning",
                    description: "Resource will be exhausted soon, intervention will shortly be required"
                },
                {
                    tag: "field", name: "Critical",
                    description: "Resource is exhausted, immediate intervention is required"
                }
            ]
        },

        {
            tag: "datatype", name: "ProductIdentifierTypeEnum", xref: "cluster§2.8.5.3",
            details: "Indicate the type of identifier used to describe the product. Devices SHOULD use globally-recognized " +
                "IDs over OEM specific ones.",

            children: [
                { tag: "field", name: "Upc", description: "12-digit Universal Product Code" },
                { tag: "field", name: "Gtin8", description: "8-digit Global Trade Item Number" },
                { tag: "field", name: "Ean", description: "13-digit European Article Number" },
                { tag: "field", name: "Gtin14", description: "14-digit Global Trade Item Number" },
                { tag: "field", name: "Oem", description: "Original Equipment Manufacturer part number" }
            ]
        },

        {
            tag: "datatype", name: "ReplacementProductStruct", xref: "cluster§2.8.5.4",
            details: "Indicates the product identifier that can be used as a replacement for the resource."
        }
    ]
});
