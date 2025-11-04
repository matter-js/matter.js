/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "AudioOutput", pics: "AUDIOOUTPUT", xref: "cluster§6.5",

    details: "This cluster provides an interface for controlling the Output on a Video Player device such as a TV." +
        "\n" +
        "This cluster would be supported on a device with audio outputs like a Video Player device (Smart TV, " +
        "TV Setup Top Box, Smart Speaker, etc)." +
        "\n" +
        "This cluster provides the list of available outputs and provides commands for selecting and renaming " +
        "them." +
        "\n" +
        "The cluster server for Audio Output is implemented by a device that has configurable audio output.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§6.5.4",
            children: [{ tag: "field", name: "NU", details: "Supports updates to output names" }]
        },
        {
            tag: "attribute", name: "OutputList", xref: "cluster§6.5.6.1",
            details: "This attribute provides the list of outputs supported by the device."
        },
        {
            tag: "attribute", name: "CurrentOutput", xref: "cluster§6.5.6.2",
            details: "This attribute contains the value of the index field of the currently selected OutputInfoStruct."
        },

        {
            tag: "command", name: "SelectOutput", xref: "cluster§6.5.7.1",

            details: "Upon receipt, this shall change the output on the device to the output at a specific index in the " +
                "Output List." +
                "\n" +
                "Note that when the current output is set to an output of type HDMI, adjustments to volume via a " +
                "Speaker endpoint on the same node may cause HDMI volume up/down commands to be sent to the given " +
                "HDMI output.",

            children: [{
                tag: "field", name: "Index", xref: "cluster§6.5.7.1.1",
                details: "This shall indicate the index field of the OutputInfoStruct from the OutputList attribute in which " +
                    "to change to."
            }]
        },

        {
            tag: "command", name: "RenameOutput", xref: "cluster§6.5.7.2",
            details: "Upon receipt, this shall rename the output at a specific index in the Output List." +
                "\n" +
                "Updates to the output name shall appear in the device’s settings menus. Name updates may " +
                "automatically be sent to the actual device to which the output connects."
        },

        {
            tag: "datatype", name: "OutputTypeEnum", xref: "cluster§6.5.5.1",
            details: "The type of output, expressed as an enum, with the following values:",
            children: [{ tag: "field", name: "Hdmi", description: "HDMI" }]
        },

        {
            tag: "datatype", name: "OutputInfoStruct", xref: "cluster§6.5.5.2",
            details: "This contains information about an output.",

            children: [
                {
                    tag: "field", name: "Index", xref: "cluster§6.5.5.2.1",
                    details: "This field shall indicate the unique index into the list of outputs."
                },
                {
                    tag: "field", name: "OutputType", xref: "cluster§6.5.5.2.2",
                    details: "This field shall indicate the type of output."
                },
                {
                    tag: "field", name: "Name", xref: "cluster§6.5.5.2.3",
                    details: "The device defined and user editable output name, such as “Soundbar”, “Speakers”. This field may be " +
                        "blank, but SHOULD be provided when known."
                }
            ]
        }
    ]
});
