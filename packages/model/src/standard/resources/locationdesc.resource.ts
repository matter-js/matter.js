/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "locationdesc", description: "Location Descriptor", xref: "core§7.19.2.49",
    details: "This data type shall be represented by the following structure:",

    children: [
        {
            tag: "field", name: "LocationName", xref: "core§7.19.2.49.1",
            details: "This field shall indicate the name of the location. For example, \"blue room\"." +
                "\n" +
                "If the location name is not user provided, the logic that generates it (clients, devices etc.) " +
                "SHOULD utilize synthesized user-friendly, understandable, names for the location, rather than opaque " +
                "values such as \"private\" or \"2fe7c241-a50a-4863-896e-c5878da5ed68\"."
        },

        {
            tag: "field", name: "FloorNumber", xref: "core§7.19.2.49.2",

            details: "This field shall indicate the level number. Negative values correspond to basement levels." +
                "\n" +
                "Value zero indicates this is the main floor, which typically includes the main entrance to the " +
                "user’s home. For a building with multiple levels, it is the client’s responsibility to map each " +
                "level to/from a FloorNumber tag value, using the level numbering convention of the region where the " +
                "client operates. For example, if the client operates in Europe, building level 1, which is one level " +
                "up from the street level, SHOULD be mapped to FloorNumber tag value 0x1. If the client operates in " +
                "North America, building level 1, which is at street level, SHOULD be mapped to FloorNumber tag value " +
                "0x0." +
                "\n" +
                "A NULL value indicates that this information is not available." +
                "\n" +
                "When the clients present the level information for user selection, they SHOULD use the operating " +
                "region to determine how to render and map this data. For example, if the client operates in North " +
                "America it SHOULD present the user a list that includes entries labeled \"basement\", \"first\", " +
                "\"second\", and internally mapped to floor numbers -1, 0, and 1. If operating in Europe, the client " +
                "SHOULD present a list that includes entries labeled \"basement\", \"ground\", \"first\", internally mapped " +
                "to floor numbers -1, 0, and 1." +
                "\n" +
                "The floor number information is expected to be mostly useful to the clients, rather than the " +
                "devices, such as for grouping devices that are located on the same level. For example, an automation " +
                "may be defined for all devices located at the basement level (floor number -1)." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> Handling complex level situations, such as half levels (side split houses), or the levels from an " +
                "  apartment building, is up to the client and/or user."
        },

        {
            tag: "field", name: "AreaType", xref: "core§7.19.2.49.3",

            details: "This field shall be the ID of an area semantic tag, located within the Common Area Namespace. For " +
                "example, this tag may indicate that the location refers to a bedroom." +
                "\n" +
                "If this field is NULL, that indicates that the area type information is not available." +
                "\n" +
                "> [!NOTE]" +
                "\n" +
                "> This field only indicates the type of the area. Multiple areas of the same type, such as bedrooms, " +
                "  may exist in a user’s home."
        }
    ]
});
