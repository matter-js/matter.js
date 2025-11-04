/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MatterDefinition } from "../MatterDefinition.js";
import {
    ClusterElement as Cluster,
    AttributeElement as Attribute,
    FieldElement as Field,
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const KeypadInput = Cluster(
    { name: "KeypadInput", id: 0x509, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 1 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "NV", constraint: "0", title: "NavigationKeyCodes" }),
        Field({ name: "LK", constraint: "1", title: "LocationKeys" }),
        Field({ name: "NK", constraint: "2", title: "NumberKeys" })
    ),

    Command(
        { name: "SendKey", id: 0x0, access: "O", conformance: "M", direction: "request", response: "SendKeyResponse" },
        Field({ name: "KeyCode", id: 0x0, type: "CecKeyCodeEnum", conformance: "M" })
    ),
    Command(
        { name: "SendKeyResponse", id: 0x1, conformance: "M", direction: "response" },
        Field({ name: "Status", id: 0x0, type: "StatusEnum", conformance: "M" })
    ),

    Datatype(
        { name: "StatusEnum", type: "enum8" },
        Field({ name: "Success", id: 0x0, conformance: "M" }),
        Field({ name: "UnsupportedKey", id: 0x1, conformance: "M" }),
        Field({ name: "InvalidKeyInCurrentState", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "CecKeyCodeEnum", type: "enum8" },
        Field({ name: "Select", id: 0x0, conformance: "M" }),
        Field({ name: "Up", id: 0x1, conformance: "M" }),
        Field({ name: "Down", id: 0x2, conformance: "M" }),
        Field({ name: "Left", id: 0x3, conformance: "M" }),
        Field({ name: "Right", id: 0x4, conformance: "M" }),
        Field({ name: "RightUp", id: 0x5, conformance: "M" }),
        Field({ name: "RightDown", id: 0x6, conformance: "M" }),
        Field({ name: "LeftUp", id: 0x7, conformance: "M" }),
        Field({ name: "LeftDown", id: 0x8, conformance: "M" }),
        Field({ name: "RootMenu", id: 0x9, conformance: "M" }),
        Field({ name: "SetupMenu", id: 0xa, conformance: "M" }),
        Field({ name: "ContentsMenu", id: 0xb, conformance: "M" }),
        Field({ name: "FavoriteMenu", id: 0xc, conformance: "M" }),
        Field({ name: "Exit", id: 0xd, conformance: "M" }),
        Field({ name: "MediaTopMenu", id: 0x10, conformance: "M" }),
        Field({ name: "MediaContextSensitiveMenu", id: 0x11, conformance: "M" }),
        Field({ name: "NumberEntryMode", id: 0x1d, conformance: "M" }),
        Field({ name: "Number11", id: 0x1e, conformance: "M" }),
        Field({ name: "Number12", id: 0x1f, conformance: "M" }),
        Field({ name: "Number0OrNumber10", id: 0x20, conformance: "M" }),
        Field({ name: "Numbers1", id: 0x21, conformance: "M" }),
        Field({ name: "Numbers2", id: 0x22, conformance: "M" }),
        Field({ name: "Numbers3", id: 0x23, conformance: "M" }),
        Field({ name: "Numbers4", id: 0x24, conformance: "M" }),
        Field({ name: "Numbers5", id: 0x25, conformance: "M" }),
        Field({ name: "Numbers6", id: 0x26, conformance: "M" }),
        Field({ name: "Numbers7", id: 0x27, conformance: "M" }),
        Field({ name: "Numbers8", id: 0x28, conformance: "M" }),
        Field({ name: "Numbers9", id: 0x29, conformance: "M" }),
        Field({ name: "Dot", id: 0x2a, conformance: "M" }),
        Field({ name: "Enter", id: 0x2b, conformance: "M" }),
        Field({ name: "Clear", id: 0x2c, conformance: "M" }),
        Field({ name: "NextFavorite", id: 0x2f, conformance: "M" }),
        Field({ name: "ChannelUp", id: 0x30, conformance: "M" }),
        Field({ name: "ChannelDown", id: 0x31, conformance: "M" }),
        Field({ name: "PreviousChannel", id: 0x32, conformance: "M" }),
        Field({ name: "SoundSelect", id: 0x33, conformance: "M" }),
        Field({ name: "InputSelect", id: 0x34, conformance: "M" }),
        Field({ name: "DisplayInformation", id: 0x35, conformance: "M" }),
        Field({ name: "Help", id: 0x36, conformance: "M" }),
        Field({ name: "PageUp", id: 0x37, conformance: "M" }),
        Field({ name: "PageDown", id: 0x38, conformance: "M" }),
        Field({ name: "Power", id: 0x40, conformance: "M" }),
        Field({ name: "VolumeUp", id: 0x41, conformance: "M" }),
        Field({ name: "VolumeDown", id: 0x42, conformance: "M" }),
        Field({ name: "Mute", id: 0x43, conformance: "M" }),
        Field({ name: "Play", id: 0x44, conformance: "M" }),
        Field({ name: "Stop", id: 0x45, conformance: "M" }),
        Field({ name: "Pause", id: 0x46, conformance: "M" }),
        Field({ name: "Record", id: 0x47, conformance: "M" }),
        Field({ name: "Rewind", id: 0x48, conformance: "M" }),
        Field({ name: "FastForward", id: 0x49, conformance: "M" }),
        Field({ name: "Eject", id: 0x4a, conformance: "M" }),
        Field({ name: "Forward", id: 0x4b, conformance: "M" }),
        Field({ name: "Backward", id: 0x4c, conformance: "M" }),
        Field({ name: "StopRecord", id: 0x4d, conformance: "M" }),
        Field({ name: "PauseRecord", id: 0x4e, conformance: "M" }),
        Field({ name: "Angle", id: 0x50, conformance: "M" }),
        Field({ name: "SubPicture", id: 0x51, conformance: "M" }),
        Field({ name: "VideoOnDemand", id: 0x52, conformance: "M" }),
        Field({ name: "ElectronicProgramGuide", id: 0x53, conformance: "M" }),
        Field({ name: "TimerProgramming", id: 0x54, conformance: "M" }),
        Field({ name: "InitialConfiguration", id: 0x55, conformance: "M" }),
        Field({ name: "SelectBroadcastType", id: 0x56, conformance: "M" }),
        Field({ name: "SelectSoundPresentation", id: 0x57, conformance: "M" }),
        Field({ name: "PlayFunction", id: 0x60, conformance: "M" }),
        Field({ name: "PausePlayFunction", id: 0x61, conformance: "M" }),
        Field({ name: "RecordFunction", id: 0x62, conformance: "M" }),
        Field({ name: "PauseRecordFunction", id: 0x63, conformance: "M" }),
        Field({ name: "StopFunction", id: 0x64, conformance: "M" }),
        Field({ name: "MuteFunction", id: 0x65, conformance: "M" }),
        Field({ name: "RestoreVolumeFunction", id: 0x66, conformance: "M" }),
        Field({ name: "TuneFunction", id: 0x67, conformance: "M" }),
        Field({ name: "SelectMediaFunction", id: 0x68, conformance: "M" }),
        Field({ name: "SelectAvInputFunction", id: 0x69, conformance: "M" }),
        Field({ name: "SelectAudioInputFunction", id: 0x6a, conformance: "M" }),
        Field({ name: "PowerToggleFunction", id: 0x6b, conformance: "M" }),
        Field({ name: "PowerOffFunction", id: 0x6c, conformance: "M" }),
        Field({ name: "PowerOnFunction", id: 0x6d, conformance: "M" }),
        Field({ name: "F1Blue", id: 0x71, conformance: "M" }),
        Field({ name: "F2Red", id: 0x72, conformance: "M" }),
        Field({ name: "F3Green", id: 0x73, conformance: "M" }),
        Field({ name: "F4Yellow", id: 0x74, conformance: "M" }),
        Field({ name: "F5", id: 0x75, conformance: "M" }),
        Field({ name: "Data", id: 0x76, conformance: "M" })
    )
);

MatterDefinition.children.push(KeypadInput);
