/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "Chime", pics: "CHIME", xref: "cluster§11.8",
    details: "This cluster provides facilities to configure and play Chime sounds, such as those used in a " +
        "doorbell.",

    children: [
        {
            tag: "attribute", name: "InstalledChimeSounds", xref: "cluster§11.8.5.1",
            details: "This attribute shall contain all installed chime sounds, represented by a list of Chime Sounds. Each " +
                "entry in this list shall have a unique ChimeID value and a unique Name value."
        },

        {
            tag: "attribute", name: "SelectedChime", xref: "cluster§11.8.5.2",

            details: "Indicates the currently selected chime sound that will be played when PlayChimeSound is invoked and " +
                "shall be the ChimeID value for the requested Chime Sound within InstalledChimeSounds." +
                "\n" +
                "This attribute may be written by the client to request a different chime sound. An attempt to write " +
                "a value that is not contained within InstalledChimeSounds shall be failed with a NOT_FOUND response. " +
                "Writes to this attribute while a chime is currently playing shall NOT affect the playback in " +
                "progress and shall only apply starting at the next PlayChimeSound command invocation."
        },

        {
            tag: "attribute", name: "Enabled", xref: "cluster§11.8.5.3",
            details: "Indicates if chime sounds can currently be played or not, and may be written by the client to enable " +
                "/ disable playing of chime sounds."
        },

        {
            tag: "event", name: "ChimeStartedPlaying", xref: "cluster§11.8.7.1",
            details: "This event shall indicate a Chime sound has just started playing." +
                "\n" +
                "The data on this event shall contain the following information.",
            children: [{
                tag: "field", name: "ChimeId", xref: "cluster§11.8.7.1.1",
                details: "This field shall represent the unique ID for the Chime sound that just started playing."
            }]
        },

        {
            tag: "command", name: "PlayChimeSound", xref: "cluster§11.8.6.1",
            details: "This command will play the currently selected chime or the chime passed in. In either case the " +
                "server shall generate the ChimeStartedPlaying event.",
            children: [{
                tag: "field", name: "ChimeId", xref: "cluster§11.8.6.1.1",
                details: "This field shall represent the unique ID for a Chime sound to play if present, instead of the " +
                    "current value in SelectedChime."
            }]
        },

        {
            tag: "datatype", name: "ChimeSoundStruct", xref: "cluster§11.8.4.1",
            details: "This struct is used to encode information needed to define a Chime Sound.",

            children: [
                {
                    tag: "field", name: "ChimeId", xref: "cluster§11.8.4.1.1",
                    details: "This field shall represent the unique ID for a Chime sound."
                },
                {
                    tag: "field", name: "Name", xref: "cluster§11.8.4.1.2",
                    details: "This field shall represent the unique user friendly name of the Chime Sound."
                }
            ]
        }
    ]
});
