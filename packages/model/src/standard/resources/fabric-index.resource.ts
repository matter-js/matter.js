/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "field", name: "FabricIndex", xref: "core§7.13.6",

    details: "This field shall be present for fabric-scoped data. This field does not have to be defined " +
        "explicitly in the field table for fabric-scoped data." +
        "\n" +
        "This field shall NOT be present in a write interaction. For a write interaction, the server shall " +
        "provide the value of the accessing fabric-index as the FabricIndex field value to processing logic, " +
        "after receipt of the interaction. For a read interaction this field shall be included in all " +
        "reported data that is defined as fabric-scoped."
});
