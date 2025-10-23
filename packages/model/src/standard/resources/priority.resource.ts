/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "priority", description: "Priority", xref: "core§7.19.2.20",
    details: "This is an enumeration of priority used to tag events and possibly other data. The data type does " +
        "not define any particular ordering among the values. Specific uses of the data type may assign " +
        "semantics to the values that imply an ordering relationship.",

    children: [
        { tag: "field", name: "Debug", description: "Information for engineering debugging/troubleshooting" },
        {
            tag: "field", name: "Info",
            description: "Information that either drives customer facing features or provides insights into device functions that are used to drive analytics use cases"
        },
        {
            tag: "field", name: "Critical",
            description: "Information or notification that impacts safety, a critical function, or ongoing reliable operation of the node or application supported on an endpoint."
        }
    ]
});
