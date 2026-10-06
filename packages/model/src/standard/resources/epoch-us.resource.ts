/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "datatype", name: "epoch-us", description: "Epoch Time in microseconds", xref: "core§7.19.2.3",

    details: "This type represents an offset, in microseconds, from 0 hours, 0 minutes, 0 seconds, on the 1st of " +
        "January, 2000 UTC (the Epoch), encoded as an unsigned 64-bit scalar value." +
        "\n" +
        "This offset is the sum of two parts: time elapsed, not counting leap-seconds, and a local time " +
        "offset. The local time offset may include a timezone offset and a may include a DST offset." +
        "\n" +
        "Any use of this type shall indicate how the associated local time offset is determined in the " +
        "specific context of that use. This may be done, for example, by simply saying the time is a UTC " +
        "time, in which case the local time offset is 0." +
        "\n" +
        "A given Epoch Time value may be interpreted in at least two ways:" +
        "\n" +
        "  1. The value can be converted to a local clock date/time (year, month, day, hours, minutes, " +
        "seconds, microseconds) by treating the local time offset as 0 and finding the UTC (year, month, " +
        "day, hours, minutes, seconds, microseconds) tuple that corresponds to an elapsed time since the " +
        "epoch time equal to the given value. The value then represents that tuple, but interpreted in " +
        "the specific timezone and DST situation associated with the value. This procedure does not " +
        "require knowing the local time offset of the value." +
        "\n" +
        "  2. The value can be converted to a UTC time by subtracting the associated local time offset from " +
        "the Epoch Time value and then treating the resulting value as an elapsed count of microseconds " +
        "since the epoch time." +
        "\n" +
        "For example, an Epoch Time value of 0x0000_0BF1_B7E1_0000 corresponds to an offset of exactly 152 " +
        "days. This can be interpreted as \"00:00:00 on June 1, 2000\" in whatever local time zone is " +
        "associated with the value. That corresponds to the following times in ISO 8601 notation:" +
        "\n" +
        "  - 2000-06-01T00:00Z if the associated local time offset is 0 (i.e. the value is in UTC)." +
        "\n" +
        "  - 2000-05-31T23:00Z if the associated local time offset is +1 hour (e.g. the CET timezone, without " +
        "daylight savings)." +
        "\n" +
        "  - 2000-06-01T00:00+02 if the associated local time offset is +1 hour." +
        "\n" +
        "  - 2000-06-01T04:00Z if the associated local time offset is -4 hours (e.g. the EDT time zone, which " +
        "includes daylight savings)." +
        "\n" +
        "  - 2000-06-01T00:00-04 if the associated local time offset is -4 hours."
});
