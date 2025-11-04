/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "FixedLabel", pics: "FLABEL", xref: "core§9.8",

    details: "This cluster is derived from the Label cluster and provides a feature for the device to tag an " +
        "endpoint with zero or more read-only labels." +
        "\n" +
        "Examples:" +
        "\n" +
        "  • A bridge can use this to indicate grouping of bridged devices. For example: All bridged devices " +
        "    whose endpoints have an entry in their LabelList \"room\":\"bedroom 2\" are in the same (bed)room." +
        "\n" +
        "  • A manufacturer can use this to identify a characteristic of an endpoint. For example to identify " +
        "    the endpoints of a luminaire, one pointing up, the other pointing down, one of the endpoints " +
        "    would have a LabelList entry \"orientation\":\"up\" while the other would have \"orientation\":\"down\". " +
        "    Using such indication, the user interface of a Node controlling this luminaire knows which of " +
        "    the endpoints is which of the lights." +
        "\n" +
        "Note that the TagList in the Descriptor cluster provides an alternative mechanism for such " +
        "self-description using standardized tags rather than manufacturer-selected strings, yielding a " +
        "standardized mechanism for features defined in the various namespaces. The second example above can " +
        "be implemented using semantic tags Direction.Upward and Direction.Downward instead of (or in " +
        "addition to) the Fixed Label cluster.",

    children: [{ tag: "attribute", name: "LabelList", xref: "core§9.8.4" }]
});
