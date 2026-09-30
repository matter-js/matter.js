/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "subject-id",
    description: "A subject granted privileges to interact with a node.", xref: "core§7.19.2.25",

    details: "A 64-bit integer that identifies the source of an action, referencing an entity that is " +
        "authenticated via a method provided by the secure channel architecture." +
        "\n" +
        "Any use of a Subject ID needs to be accompanied by a method to determine which type of subject is " +
        "being represented. There are several types of subjects that may need to be disambiguated, depending " +
        "on the authentication mode used:" +
        "\n" +
        "  - PASE: Lower 16 bits represent the Passcode ID, upper 48 bits are clear." +
        "\n" +
        "  - CASE: 64 bits represent either the Node ID or a CASE Authenticated Tag." +
        "\n" +
        "  - Group: Lower 16 bits represent the Group ID, upper 48 bits are clear."
});
