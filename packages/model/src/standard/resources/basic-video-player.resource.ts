/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "BasicVideoPlayer", classification: "simple", xref: "device§10.2",

    details: "This defines conformance to the Basic Video Player device type." +
        "\n" +
        "A Video Player (either Basic or Casting) represents a device that is able to play media to a " +
        "physical output or to a display screen which is part of the device." +
        "\n" +
        "A Basic Video Player has playback controls (play, pause, etc.) and keypad remote controls (up, down, " +
        "number input), but is not able to launch content and is not a content app platform (the Casting " +
        "Video Player device type is used for these functions)." +
        "\n" +
        "For example, a Basic Video Player can be a traditional TV device a physical media playback device " +
        "such as a DVD Player, or a device that provides input to another device like a TV or computer " +
        "monitor." +
        "\n" +
        "See Section 10.1, “Video Player Architecture” for additional Basic Video Player requirements " +
        "relating to Video Player device endpoint composition, commissioning, feature representation in " +
        "clusters, and UI context.",

    children: [
        { tag: "requirement", name: "OnOff", xref: "device§10.2.4" },
        { tag: "requirement", name: "WakeOnLan", xref: "device§10.2.4" },
        { tag: "requirement", name: "Channel", xref: "device§10.2.4" },
        { tag: "requirement", name: "TargetNavigator", xref: "device§10.2.4" },
        { tag: "requirement", name: "MediaPlayback", xref: "device§10.2.4" },
        { tag: "requirement", name: "MediaInput", xref: "device§10.2.4" },
        { tag: "requirement", name: "LowPower", xref: "device§10.2.4" },
        { tag: "requirement", name: "KeypadInput", xref: "device§10.2.4" },
        { tag: "requirement", name: "AudioOutput", xref: "device§10.2.4" },
        { tag: "requirement", name: "ContentControl", xref: "device§10.2.4" },
        { tag: "requirement", name: "Messages", xref: "device§10.2.4" },

        {
            tag: "field", name: "conditions",
            children: [{
                tag: "field", name: "PhysicalInputs", description: "The device has physical inputs for media.",
                xref: "device§10.2.3"
            }]
        }
    ]
});
