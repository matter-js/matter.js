/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "Chime", xref: "device§16.7",

    details: "A Chime device is a device which can play from a range of pre installed sounds and is typically used " +
        "with a Doorbell, Audio Doorbell, or Video Doorbell." +
        "\n" +
        "### Element Requirements" +
        "\n" +
        "There are no cluster element overrides.",

    children: [
        { tag: "requirement", name: "Chime", xref: "device§16.7.5" },
        { tag: "requirement", name: "Identify", xref: "device§16.7.5" },
        { tag: "requirement", name: "Speaker", xref: "device§16.7.3" }
    ]
});
