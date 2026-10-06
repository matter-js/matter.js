/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "string", description: "Character String", xref: "core§7.19.2.40",

    details: "The character string data type is derived from an octet string. The octets shall be characters with " +
        "UTF-8 encoding. An instance of this data type shall NOT contain truncated code points." +
        "\n" +
        "Note that the character string type is a bounded sequence of characters whose size bound format is " +
        "not specified in the data model, but rather a property of the underlying encoding. Therefore, no " +
        "assumptions are to be made about the presence or absence of a length prefix or NULL-terminator byte, " +
        "or other implementation considerations." +
        "\n" +
        "It is recommended to define constraints on the maximum possible string length." +
        "\n" +
        "If at least one of the code points within the string has value 31 (0x1F), which is Unicode " +
        "INFORMATION SEPARATOR 1 and ASCII Unit Separator, then any client making use of the string shall " +
        "only consider the code points that appear before the first INFORMATION SEPARATOR 1 as being the " +
        "textual information carried by the string. Any comparison between such a string and other strings " +
        "shall use the textual component before the first INFORMATION SEPARATOR 1. The remainder of the " +
        "character string after a first INFORMATION SEPARATOR 1 is reserved for future use by this " +
        "specification. Implementations of this version of the specification shall NOT produce character " +
        "strings containing INFORMATION SEPARATOR 1."
});
