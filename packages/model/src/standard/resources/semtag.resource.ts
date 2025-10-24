/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "semtag", description: "Semantic Tag", xref: "core§7.19.2.46",
    details: "This data type shall be represented by the following structure:",

    children: [
        {
            tag: "field", name: "MfgCode", xref: "core§7.19.2.46.1",

            details: "If the MfgCode field is not NULL, it shall be the Vendor ID of the manufacturer who has defined a " +
                "certain namespace and the NamespaceID field shall be the ID of a namespace defined by the " +
                "manufacturer identified in the MfgCode field." +
                "\n" +
                "If a manufacturer specific Tag field is indicated in a list of SemanticTagStruct entries, the list " +
                "shall include at least one standard tag which is not from any manufacturer’s namespace. A standard " +
                "tag is a tag from a common namespace, a derived cluster namespace, or an applicable device-specific " +
                "namespace." +
                "\n" +
                "If MfgCode is NULL, the NamespaceID field shall indicate a standard namespace."
        },

        {
            tag: "field", name: "NamespaceId", xref: "core§7.19.2.46.2",
            details: "The NamespaceID field shall identify a namespace." +
                "\n" +
                "The common and device-specific semantic tag namespaces are listed in StandardNamespaces."
        },

        {
            tag: "field", name: "Tag", xref: "core§7.19.2.46.3",
            details: "The Tag field shall be the ID of a semantic tag located within the namespace indicated by " +
                "NamespaceID." +
                "\n" +
                "A device may expose tags from the common or device-specific namespaces and from " +
                "manufacturer-specific namespaces in a single TagList."
        },

        {
            tag: "field", name: "Label", xref: "core§7.19.2.46.4",

            details: "The Label field, if present, shall contain human-readable text suitable for display on a client. The " +
                "content of the Label field is defined by the manufacturer." +
                "\n" +
                "This field shall be present when the MfgCode is not NULL. This field SHOULD NOT be used if the Tag " +
                "is from a standard namespace, unless the Tag requires further qualification. For example: A Tag that " +
                "has the meaning of \"room\" in a location namespace, would require the a label string to qualify the " +
                "type of room, such as \"1\", \"2b\", \"Bathroom\", etc."
        }
    ]
});
