/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "HoldTimeLimitsStruct", xref: "cluster§2.7.5.4",
    details: "This structure provides information on the server’s supported values for the HoldTime attribute.",

    children: [
        {
            tag: "field", name: "HoldTimeMin", xref: "cluster§2.7.5.4.1",
            details: "This field shall specify the minimum value of the server’s supported value for the HoldTime " +
                "attribute, in seconds."
        },
        {
            tag: "field", name: "HoldTimeMax", xref: "cluster§2.7.5.4.2",
            details: "This field shall specify the maximum value of the server’s supported value for the HoldTime " +
                "attribute, in seconds."
        },

        {
            tag: "field", name: "HoldTimeDefault", xref: "cluster§2.7.5.4.3",
            details: "This field shall specify the (manufacturer-determined) default value of the server’s HoldTime " +
                "attribute, in seconds. This is the value that a client who wants to reset the settings to a valid " +
                "default SHOULD use."
        }
    ]
});
