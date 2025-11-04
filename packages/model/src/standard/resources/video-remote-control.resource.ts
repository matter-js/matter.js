/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "deviceType", name: "VideoRemoteControl", xref: "device§10.7",
    details: "This defines conformance to the Video Remote Control device type." +
        "\n" +
        "A Video Remote Control is a client that can control a Video Player, for example, a traditional " +
        "universal remote control.",

    children: [
        { tag: "requirement", name: "OnOff", xref: "device§10.7.4" },
        { tag: "requirement", name: "LevelControl", xref: "device§10.7.4" },
        { tag: "requirement", name: "WakeOnLan", xref: "device§10.7.4" },
        { tag: "requirement", name: "Channel", xref: "device§10.7.4" },
        { tag: "requirement", name: "TargetNavigator", xref: "device§10.7.4" },
        { tag: "requirement", name: "MediaPlayback", xref: "device§10.7.4" },
        { tag: "requirement", name: "MediaInput", xref: "device§10.7.4" },
        { tag: "requirement", name: "LowPower", xref: "device§10.7.4" },
        { tag: "requirement", name: "KeypadInput", xref: "device§10.7.4" },
        { tag: "requirement", name: "ContentLauncher", xref: "device§10.7.4" },
        { tag: "requirement", name: "AudioOutput", xref: "device§10.7.4" },
        { tag: "requirement", name: "ApplicationLauncher", xref: "device§10.7.4" },
        { tag: "requirement", name: "AccountLogin", xref: "device§10.7.4" },
        { tag: "requirement", name: "ContentControl", xref: "device§10.7.4" }
    ]
});
