/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "ipv6pre", description: "IPv6 Prefix", xref: "core§7.19.2.44",

    details: "The IPv6 prefix data type is derived from an octet string. The octets shall be encoded" +
        "\n" +
        "  - The first octet shall encode the prefix length, in bits, in the range of 0 to 128." +
        "\n" +
        "    - A value of 0 indicates an absent/invalid prefix." +
        "\n" +
        "  - The subsequent octets shall encode the contiguous leftmost bits of the prefix, in network byte " +
        "order, with left justification, such that the first bit of the prefix is in the most significant " +
        "bit of the first octet. Encoding SHOULD use the least number of bytes to encode the prefix but " +
        "may include unused trailing zeroes." +
        "\n" +
        "Examples of encoding:" +
        "\n" +
        "  - Preferred minimal encoding: Prefix 2001:0DB8:0:CD30::/60 -> 9 octets -> 3C20010DB80000CD30" +
        "\n" +
        "  - Preferred minimal encoding: Prefix 2001:0DB8:BB00::/40 -> 6 octets -> 2820010DB8BB" +
        "\n" +
        "  - Allowed non-minimal encoding: Prefix 2001:0DB8:BB00::/40 -> 7 octets -> 2820010DB8BB00"
});
