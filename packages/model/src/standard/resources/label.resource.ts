/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "Label", classification: "endpoint", pics: "LABEL", xref: "core§9.7",
    details: "This cluster provides a feature to tag an endpoint with zero or more labels. This is a base cluster " +
        "that requires a derived cluster to create an instance.",

    children: [
        {
            tag: "attribute", name: "LabelList", xref: "core§9.7.5.1",
            details: "This is a list of string tuples. Each entry is a LabelStruct."
        },

        {
            tag: "datatype", name: "LabelStruct", xref: "core§9.7.4.1",
            details: "This is a string tuple with strings that are user defined.",

            children: [
                {
                    tag: "field", name: "Label", xref: "core§9.7.4.1.1",
                    details: "The Label or Value semantic is not defined here. Label examples: \"room\", \"zone\", \"group\", " +
                        "\"direction\"."
                },

                {
                    tag: "field", name: "Value", xref: "core§9.7.4.1.2",
                    details: "The Label or Value semantic is not defined here. The Value is a discriminator for a Label that may " +
                        "have multiple instances." +
                        "\n" +
                        "Label:Value examples: \"room\":\"bedroom 2\", \"orientation\":\"North\", \"floor\":\"2\", \"direction\":\"up\""
                }
            ]
        }
    ]
});
