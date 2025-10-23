/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "namespace", description: "Namespace", xref: "core§7.19.2.47",
    details: "The Namespace type identifies the namespace used for a semantic tag.",

    children: [
        {
            tag: "field", name: "Closure",

            details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
                "association with a feature of a Closure, e.g. the button to activate opening a garage door." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> This namespace has been deprecated as of Matter 1.4.2." +
                "\n" +
                "Clients SHOULD still have support for these tags, since the tags could be used by a server certified " +
                "on a previous revision of Matter."
        },

        {
            tag: "field", name: "CompassDirection",
            details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
                "association with a movement into a certain compass direction. Note the difference with Chapter 4, " +
                "Common Compass Location Semantic Tag Namespace."
        },

        {
            tag: "field", name: "CompassLocation",
            details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
                "association with a position in a certain compass direction (e.g. an outdoor sensor in the North " +
                "garden). Note the difference with Chapter 3, Common Compass Direction Semantic Tag Namespace."
        },

        {
            tag: "field", name: "Direction",
            details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
                "association with a movement in a certain direction relative to the device. Note the difference with " +
                "Chapter 9, Common Position Semantic Tag Namespace."
        },

        {
            tag: "field", name: "Level",
            details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
                "association with a certain level for a feature of a device (e.g. a button to set the speed of a " +
                "fan)."
        },

        {
            tag: "field", name: "Location",
            details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
                "association with a location of a device (e.g. an outdoor temperature sensor)."
        },
        {
            tag: "field", name: "Number",
            details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
                "association with a certain numeric feature of a device (e.g. a numeric input button)."
        },

        {
            tag: "field", name: "Position",

            details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
                "association with a position relative to the device (e.g. the temperature sensor in the top drawer of " +
                "a refrigerator, or location of the buttons on a multi-button switch device). Note the difference " +
                "with Chapter 5, Common Direction Semantic Tag Namespace." +
                "\n" +
                "When multiple endpoints are used for device types, and the associated consumer-facing locations of " +
                "those endpoints are organized in a straight line, grid or matrix, these endpoints SHOULD be " +
                "allocated in top-to-bottom, left-to-right order." +
                "\n" +
                "For grids or arrays larger than 3 elements in any direction, the Row and Column tags SHOULD be used." +
                "\n" +
                "If the Row or Column tags are used, the Label field in the same Semantic Tag structure shall be " +
                "filled with a number comprised of Arabic numerals encoded as a string to indicate the row/column of " +
                "the item. Number words (e.g. \"one\", \"two\", etc.) shall NOT be used to describe the position of the " +
                "item. The first row/column shall use Label \"1\"." +
                "\n" +
                "The following example illustrates a compound device comprised of 9 endpoints arranged in a 3x3 grid. " +
                "This example uses position tags to indicate position."
        },

        {
            tag: "field", name: "ElectricalMeasurement",
            details: "The tags contained in this namespace are restricted for use in the electrical measurement domain and " +
                "shall NOT be used in any other domain or context."
        },
        {
            tag: "field", name: "Laundry",
            details: "The tags contained in this namespace are restricted for use in the laundry domain and shall NOT be " +
                "used in any other domain or context."
        },
        {
            tag: "field", name: "PowerSource",
            details: "The tags contained in this namespace are restricted for use in the power source domain and shall NOT " +
                "be used in any other domain or context."
        },
        {
            tag: "field", name: "AreaNamespace",
            details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
                "association with an indoor or outdoor area of a home."
        },
        {
            tag: "field", name: "LandmarkNamespace",
            details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
                "association with a home landmark."
        },

        {
            tag: "field", name: "RelativePosition",
            details: "The tags contained in this namespace may be used in any domain or context, to indicate an " +
                "association with a position relative to some reference, which must be specified by the user of these " +
                "tags. For example, the position may be relative to a household item, such as a dining table, and the " +
                "user of these tags must indicate that. Note the difference with Chapter 9, Common Position Semantic " +
                "Tag Namespace, which contains tags indicating the position relative to the device."
        },

        {
            tag: "field", name: "Refrigerator",
            details: "The tags contained in this namespace are restricted for use in the refrigerator domain and shall NOT " +
                "be used in any other domain or context."
        },
        {
            tag: "field", name: "RoomAirConditioner",
            details: "The tags contained in this namespace are restricted for use in the room air conditioner domain and " +
                "shall NOT be used in any other domain or context."
        },

        {
            tag: "field", name: "Switches",

            details: "The tags contained in this namespace are restricted for use in the switches domain and shall NOT be " +
                "used in any other domain or context. They are intended to indicate the function of a button on a " +
                "switch device to allow a client to make an optimized user interface which matches the actual device " +
                "without requiring a-priori knowledge of the layout of each specific switch device." +
                "\n" +
                "See the rules for applying these and other tags for switch devices, e.g. from the Common Position " +
                "Namespace and the Common Number Namespace in the Generic Switch device type section in the Device " +
                "Library."
        }
    ]
});
