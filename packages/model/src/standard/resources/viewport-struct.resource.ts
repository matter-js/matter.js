/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "ViewportStruct", xref: "cluster§11.1.3.2",
    details: "This struct is used to encode a bounding rectangle of the viewport on the image sensor",

    children: [
        {
            tag: "field", name: "X1", xref: "cluster§11.1.3.2.1",
            details: "This field shall represent the position of the starting vertex along the horizontal (x) axis."
        },
        {
            tag: "field", name: "Y1", xref: "cluster§11.1.3.2.2",
            details: "This field shall represent the position of the starting vertex along the vertical (y) axis."
        },
        {
            tag: "field", name: "X2", xref: "cluster§11.1.3.2.3",
            details: "This field shall represent the position of the ending vertex along the horizontal (x) axis."
        },
        {
            tag: "field", name: "Y2", xref: "cluster§11.1.3.2.4",
            details: "This field shall represent the position of the ending vertex along the vertical (y) axis."
        }
    ]
});
