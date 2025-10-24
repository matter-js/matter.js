/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "semanticNamespace", name: "Switches", xref: "namespace§18",

    details: "The tags contained in this namespace are restricted for use in the switches domain and shall NOT be " +
        "used in any other domain or context. They are intended to indicate the function of a button on a " +
        "switch device to allow a client to make an optimized user interface which matches the actual device " +
        "without requiring a-priori knowledge of the layout of each specific switch device." +
        "\n" +
        "See the rules for applying these and other tags for switch devices, e.g. from the Common Position " +
        "Namespace and the Common Number Namespace in the Generic Switch device type section in the Device " +
        "Library.",

    children: [
        { tag: "semanticTag", name: "Up", description: "e.g. dim up (light)" },
        { tag: "semanticTag", name: "Down", description: "e.g. dim down (light)" },
        { tag: "semanticTag", name: "Next", description: "e.g. select next scene" },
        { tag: "semanticTag", name: "Previous", description: "e.g. select previous scene" },
        { tag: "semanticTag", name: "EnterOkSelect", description: "Enter/OK/Select function" },

        {
            tag: "semanticTag", name: "Custom", description: "Textual description provided in Label field",
            xref: "namespace§18.1",
            details: "When this value is used, the Label field in the same Semantic Tag structure shall be filled with a " +
                "textual description of the function indicated on the button, such as a label or icon printed on the " +
                "button, e.g. \"dining\"."
        },

        { tag: "semanticTag", name: "Open", description: "e.g. open window covering" },
        { tag: "semanticTag", name: "Close", description: "e.g. close window covering" },
        { tag: "semanticTag", name: "Stop", description: "e.g. stop moving window covering" }
    ]
});
