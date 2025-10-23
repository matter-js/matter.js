/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "UnitLocalization", classification: "node", pics: "LUNIT", xref: "core§11.5",

    details: "Nodes should be expected to be deployed to any and all regions of the world. These global regions " +
        "may have differing preferences for the units in which values are conveyed in communication to a " +
        "user. As such, Nodes that visually or audibly convey measurable values to the user need a mechanism " +
        "by which they can be configured to use a user’s preferred unit." +
        "\n" +
        "This cluster supports an interface to a Node. It provides attributes for determining and configuring " +
        "the units that a Node shall utilize when conveying values in communication to a user.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "core§11.5.4",
            children: [{
                tag: "field", name: "TEMP",
                details: "The Node can be configured to use different units of temperature when conveying values to a user."
            }]
        },

        {
            tag: "attribute", name: "TemperatureUnit", xref: "core§11.5.6.1",

            details: "Indicates the unit for the Node to use only when conveying temperature in communication to the user, " +
                "for example such as via a user interface on the device. If provided, this value shall take priority " +
                "over any unit implied through the ActiveLocale Attribute." +
                "\n" +
                "An attempt to write to this attribute with a value not included in the SupportedTemperatureUnits " +
                "attribute list shall result in a CONSTRAINT_ERROR."
        },

        {
            tag: "attribute", name: "SupportedTemperatureUnits", xref: "core§11.5.6.2",
            details: "Indicates a list of units supported by the Node to be used when writing the TemperatureUnit " +
                "attribute of this cluster. Each entry in the list shall be unique."
        },

        {
            tag: "datatype", name: "TempUnitEnum", xref: "core§11.5.5.1",
            children: [
                { tag: "field", name: "Fahrenheit", description: "Temperature conveyed in Fahrenheit" },
                { tag: "field", name: "Celsius", description: "Temperature conveyed in Celsius" },
                { tag: "field", name: "Kelvin", description: "Temperature conveyed in Kelvin" }
            ]
        }
    ]
});
