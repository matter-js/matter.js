/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "LocalizationConfiguration", pics: "LCFG", xref: "core§11.3",

    details: "Nodes should be expected to be deployed to any and all regions of the world. These global regions " +
        "may have differing common languages, units of measurements, and numerical formatting standards. As " +
        "such, Nodes that visually or audibly convey information need a mechanism by which they can be " +
        "configured to use a user’s preferred language, units, etc." +
        "\n" +
        "This cluster supports an interface to a Node. It provides attributes for determining and configuring " +
        "localization information that a Node shall utilize when conveying values to a user.",

    children: [
        {
            tag: "attribute", name: "ActiveLocale", xref: "core§11.3.4.1",

            details: "The ActiveLocale attribute shall represent the locale that the Node is currently configured to use " +
                "when conveying information. The ActiveLocale attribute shall be a Language Tag as defined by BCP47. " +
                "The ActiveLocale attribute shall have a default value assigned by the Vendor and shall be a value " +
                "contained within the SupportedLocales attribute." +
                "\n" +
                "An attempt to write a value to ActiveLocale that is not present in SupportedLocales shall result in " +
                "a CONSTRAINT_ERROR error."
        },

        {
            tag: "attribute", name: "SupportedLocales", xref: "core§11.3.4.2",
            details: "The SupportedLocales attribute shall represent a list of locale strings that are valid values for " +
                "the ActiveLocale attribute. The list shall NOT contain any duplicate entries. The ordering of items " +
                "within the list SHOULD NOT express any meaning."
        }
    ]
});
