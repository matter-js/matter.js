/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "ipv6adr", description: "IPv6 Address", xref: "core§7.19.2.43",

    details: "The IPv6 address data type is derived from an octet string. The octets shall correspond to the full " +
        "16 octets that comprise an IPv6 address as defined by RFC4291. The octets shall be presented in " +
        "network byte order." +
        "\n" +
        "Examples of encoding:" +
        "\n" +
        "  - Address 2001:DB8:0:0:8:800:200C:417A -> 20010DB80000000000080800200C417A" +
        "\n" +
        "  - Address 2001:0DB8:1122:3344:5566:7788:99AA:BBCC -> 20010DB8112233445566778899AABBCC"
});
