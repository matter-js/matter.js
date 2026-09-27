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
        "### Device Type Requirements" +
        "\n" +
        "A chime may expose elements of its functionality through additional device types on different " +
        "endpoints. All devices used in compositions shall adhere to the disambiguation requirements of the " +
        "System Model. Other device types, not explicitly listed in the table, may also be included in device " +
        "compositions but are not considered part of the core functionality of the device." +
        "\n" +
        "Chimes having sound actuators may compose a child endpoint with Speaker device type to specifically " +
        "allow control of the volume or mute/unmute state of sound generation." +
        "\n" +
        "When a Speaker device is composed under a chime, the following treatment applies:" +
        "\n" +
        "  - While different mechanisms could generate the sound, with more or less fidelity, the requirement " +
        "is that the standard definition for muting and sound level control of the Speaker device type " +
        "shall apply. This holds even if the sound generator does not actually employ a real \"speaker\" " +
        "element (such as tuned bars being struck), whose actuation shall be gated by the On/Off Cluster " +
        "on the Speaker endpoint." +
        "\n" +
        "  - Other clusters in the Speaker device type would also apply with the requisite data dependencies " +
        "against the functionality of sound output." +
        "\n" +
        "  - Other modalities of chime actuation, such as visual/light feedback SHOULD NOT be impacted by the " +
        "state of the clusters in the Speaker endpoint, which are reserved for sound feedback." +
        "\n" +
        "    > [!NOTE]" +
        "\n" +
        "    > NOTE: The Chime device type also includes the Chime server cluster, which has an Enabled " +
        "      attribute. This attribute completely disables the Chime, which also means that any visual " +
        "indicators would also be disabled, and also acts as a form of global muting. For example, if " +
        "the On/Off cluster of the child Speaker device is set to from On (not muted) to Off (muted) " +
        "and the Chime cluster's Enabled attribute is already set to true, the Enabled attribute would " +
        "not change state. Similarly the Chime cluster's Enabled attribute changing would not change " +
        "the child Speaker's On/Off cluster via data dependency if there are other modalities to allow " +
        "a user to determine Chime actuation (e.g. visual indicators).",

    children: [
        { tag: "requirement", name: "Chime", xref: "device§16.7.5" },
        { tag: "requirement", name: "Identify", xref: "device§16.7.5" },
        { tag: "requirement", name: "Speaker", xref: "device§16.7.3" }
    ]
});
