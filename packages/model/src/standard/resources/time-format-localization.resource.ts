/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "TimeFormatLocalization", pics: "LTIME", xref: "core§11.4",

    details: "Nodes should be expected to be deployed to any and all regions of the world. These global regions " +
        "may have differing preferences for how dates and times are conveyed. As such, Nodes that visually or " +
        "audibly convey time information need a mechanism by which they can be configured to use a user’s " +
        "preferred format." +
        "\n" +
        "This cluster supports an interface to a Node. It provides attributes for determining and configuring " +
        "time and date formatting information that a Node shall utilize when conveying values to a user.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "core§11.4.4",
            children: [{
                tag: "field", name: "CALFMT",
                details: "The Node can be configured to use different calendar formats when conveying values to a user."
            }]
        },

        {
            tag: "attribute", name: "HourFormat", xref: "core§11.4.6.1",

            details: "Indicates the format that the Node is currently configured to use when conveying the hour unit of " +
                "time." +
                "\n" +
                "If not UseActiveLocale, this value shall take priority over any unit implied through the " +
                "ActiveLocale attribute." +
                "\n" +
                "If UseActiveLocale, any unit implied through the ActiveLocale attribute is used as the hour format, " +
                "and if ActiveLocale is not present, the hour format is unknown."
        },

        {
            tag: "attribute", name: "ActiveCalendarType", xref: "core§11.4.6.2",

            details: "Indicates the calendar format that the Node is currently configured to use when conveying dates." +
                "\n" +
                "If not UseActiveLocale, this value shall take priority over any unit implied through the " +
                "ActiveLocale attribute." +
                "\n" +
                "If UseActiveLocale, any unit implied through the ActiveLocale attribute is used as the calendar " +
                "type, and if ActiveLocale is not present, the calendar type is unknown."
        },

        {
            tag: "attribute", name: "SupportedCalendarTypes", xref: "core§11.4.6.3",
            details: "Indicates a list of CalendarTypeEnum values that are supported by the Node. The list shall NOT " +
                "contain any duplicate entries. The ordering of items within the list SHOULD NOT express any meaning. " +
                "The maximum length of the SupportedCalendarTypes list shall be equivalent to the number of " +
                "enumerations within CalendarTypeEnum."
        },

        {
            tag: "datatype", name: "HourFormatEnum", xref: "core§11.4.5.1",
            children: [
                { tag: "field", name: "12Hr", description: "Time conveyed with a 12-hour clock" },
                { tag: "field", name: "24Hr", description: "Time conveyed with a 24-hour clock" },
                { tag: "field", name: "UseActiveLocale", description: "Use active locale clock" }
            ]
        },

        {
            tag: "datatype", name: "CalendarTypeEnum", xref: "core§11.4.5.2",

            children: [
                { tag: "field", name: "Buddhist", description: "Dates conveyed using the Buddhist calendar" },
                { tag: "field", name: "Chinese", description: "Dates conveyed using the Chinese calendar" },
                { tag: "field", name: "Coptic", description: "Dates conveyed using the Coptic calendar" },
                { tag: "field", name: "Ethiopian", description: "Dates conveyed using the Ethiopian calendar" },
                { tag: "field", name: "Gregorian", description: "Dates conveyed using the Gregorian calendar" },
                { tag: "field", name: "Hebrew", description: "Dates conveyed using the Hebrew calendar" },
                { tag: "field", name: "Indian", description: "Dates conveyed using the Indian calendar" },
                { tag: "field", name: "Islamic", description: "Dates conveyed using the Islamic calendar" },
                { tag: "field", name: "Japanese", description: "Dates conveyed using the Japanese calendar" },
                { tag: "field", name: "Korean", description: "Dates conveyed using the Korean calendar" },
                { tag: "field", name: "Persian", description: "Dates conveyed using the Persian calendar" },
                { tag: "field", name: "Taiwanese", description: "Dates conveyed using the Taiwanese calendar" },
                { tag: "field", name: "UseActiveLocale", description: "calendar implied from active locale" }
            ]
        }
    ]
});
