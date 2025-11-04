/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "KeypadInput", pics: "KEYPADINPUT", xref: "cluster§6.8",

    details: "This cluster provides an interface for key code based input and control on a device like a Video " +
        "Player or an endpoint like a Content App. This may include text or action commands such as UP, DOWN, " +
        "and SELECT." +
        "\n" +
        "This cluster would be supported on Video Player devices as well as devices that support remote " +
        "control input from a keypad or remote. This cluster provides the list of supported keypad inputs and " +
        "provides a command for sending them." +
        "\n" +
        "The cluster server for Keypad Input is implemented by a device that can receive keypad input, such " +
        "as a Video Player, or an endpoint that can receive keypad input, such as a Content App." +
        "\n" +
        "The key codes used are those defined in the HDMI CEC specification (see HDMI)." +
        "\n" +
        "Devices may understand a subset of these key codes. Feature flags are used to indicate a specific " +
        "subset that is supported. Device may support additional codes beyond what is indicated in feature " +
        "flags.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§6.8.4",
            children: [
                { tag: "field", name: "NV", details: "Supports UP, DOWN, LEFT, RIGHT, SELECT, BACK, EXIT, MENU" },
                { tag: "field", name: "LK", details: "Supports CEC keys 0x0A (Settings) and 0x09 (Home)" },
                { tag: "field", name: "NK", details: "Supports numeric input 0..9" }
            ]
        },

        {
            tag: "command", name: "SendKey", xref: "cluster§6.8.6.1",

            details: "Upon receipt, this shall process a keycode as input to the media endpoint." +
                "\n" +
                "If a device has multiple media endpoints implementing this cluster, such as a casting video player " +
                "endpoint with one or more content app endpoints, then only the endpoint receiving the command shall " +
                "process the keycode as input. In other words, a specific content app endpoint shall NOT process a " +
                "keycode received by a different content app endpoint." +
                "\n" +
                "If a second SendKey request with the same KeyCode value is received within 200 ms, then the endpoint " +
                "will consider the first key press to be a press and hold. When such a repeat KeyCode value is not " +
                "received within 200 ms, then the endpoint will consider the last key press to be a release.",

            children: [{
                tag: "field", name: "KeyCode", xref: "cluster§6.8.6.1.1",
                details: "This field shall indicate the key code to process."
            }]
        },

        {
            tag: "command", name: "SendKeyResponse", xref: "cluster§6.8.6.2",
            details: "This command shall be generated in response to a SendKey command.",
            children: [{
                tag: "field", name: "Status", xref: "cluster§6.8.6.2.1",
                details: "This field shall indicate the status of the request."
            }]
        },

        {
            tag: "datatype", name: "StatusEnum", xref: "cluster§6.8.5.1",

            children: [
                { tag: "field", name: "Success", description: "Succeeded" },
                { tag: "field", name: "UnsupportedKey", description: "Key code is not supported." },
                {
                    tag: "field", name: "InvalidKeyInCurrentState",
                    description: "Requested key code is invalid in the context of the responder’s current state."
                }
            ]
        },

        { tag: "datatype", name: "CecKeyCodeEnum", xref: "cluster§6.8.5.2" }
    ]
});
