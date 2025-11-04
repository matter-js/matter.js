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
    EventElement as Event,
    CommandElement as Command,
    DatatypeElement as Datatype
} from "../../elements/index.js";

export const MediaPlayback = Cluster(
    { name: "MediaPlayback", id: 0x506, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "AS", constraint: "0", title: "AdvancedSeek" }),
        Field({ name: "VS", constraint: "1", title: "VariableSpeed" }),
        Field({ name: "TT", constraint: "2", title: "TextTracks" }),
        Field({ name: "AT", constraint: "3", title: "AudioTracks" }),
        Field({ name: "AA", constraint: "4", title: "AudioAdvance" })
    ),

    Attribute({ name: "CurrentState", id: 0x0, type: "PlaybackStateEnum", access: "R V", conformance: "M", constraint: "desc" }),
    Attribute({
        name: "StartTime", id: 0x1, type: "epoch-us", access: "R V", conformance: "AS", constraint: "desc",
        default: null, quality: "X"
    }),
    Attribute({
        name: "Duration", id: 0x2, type: "uint64", access: "R V", conformance: "AS", constraint: "desc",
        default: null, quality: "X"
    }),
    Attribute({
        name: "SampledPosition", id: 0x3, type: "PlaybackPositionStruct", access: "R V", conformance: "AS",
        constraint: "desc", default: null, quality: "X"
    }),
    Attribute({
        name: "PlaybackSpeed", id: 0x4, type: "single", access: "R V", conformance: "AS",
        constraint: "desc", default: 0
    }),
    Attribute({
        name: "SeekRangeEnd", id: 0x5, type: "uint64", access: "R V", conformance: "AS", constraint: "desc",
        default: null, quality: "X"
    }),
    Attribute({
        name: "SeekRangeStart", id: 0x6, type: "uint64", access: "R V", conformance: "AS",
        constraint: "desc", default: null, quality: "X"
    }),
    Attribute({
        name: "ActiveAudioTrack", id: 0x7, type: "TrackStruct", access: "R V", conformance: "AT",
        constraint: "desc", default: null, quality: "X"
    }),

    Attribute(
        {
            name: "AvailableAudioTracks", id: 0x8, type: "list", access: "R V", conformance: "AT",
            constraint: "desc", default: null, quality: "X"
        },
        Field({ name: "entry", type: "TrackStruct" })
    ),

    Attribute({
        name: "ActiveTextTrack", id: 0x9, type: "TrackStruct", access: "R V", conformance: "TT",
        constraint: "desc", default: null, quality: "X"
    }),

    Attribute(
        {
            name: "AvailableTextTracks", id: 0xa, type: "list", access: "R V", conformance: "TT",
            constraint: "desc", default: null, quality: "X"
        },
        Field({ name: "entry", type: "TrackStruct" })
    ),

    Event(
        { name: "StateChanged", id: 0x0, access: "V", conformance: "O", priority: "info" },
        Field({ name: "CurrentState", id: 0x0, type: "PlaybackStateEnum", conformance: "M", constraint: "desc" }),
        Field({ name: "StartTime", id: 0x1, type: "epoch-us", conformance: "AS", constraint: "desc" }),
        Field({ name: "Duration", id: 0x2, type: "uint64", conformance: "AS", constraint: "desc" }),
        Field({ name: "SampledPosition", id: 0x3, type: "PlaybackPositionStruct", conformance: "AS", constraint: "desc" }),
        Field({ name: "PlaybackSpeed", id: 0x4, type: "single", conformance: "AS", constraint: "desc" }),
        Field({ name: "SeekRangeEnd", id: 0x5, type: "uint64", conformance: "AS", constraint: "desc" }),
        Field({ name: "SeekRangeStart", id: 0x6, type: "uint64", conformance: "AS", constraint: "desc" }),
        Field({ name: "Data", id: 0x7, type: "octstr", conformance: "O", constraint: "max 900" }),
        Field({ name: "AudioAdvanceUnmuted", id: 0x8, type: "bool", conformance: "AA", constraint: "desc", default: false })
    ),

    Command({ name: "Play", id: 0x0, access: "O", conformance: "M", direction: "request", response: "PlaybackResponse" }),
    Command({ name: "Pause", id: 0x1, access: "O", conformance: "M", direction: "request", response: "PlaybackResponse" }),
    Command({ name: "Stop", id: 0x2, access: "O", conformance: "M", direction: "request", response: "PlaybackResponse" }),
    Command({ name: "StartOver", id: 0x3, access: "O", conformance: "O", direction: "request", response: "PlaybackResponse" }),
    Command({ name: "Previous", id: 0x4, access: "O", conformance: "O", direction: "request", response: "PlaybackResponse" }),
    Command({ name: "Next", id: 0x5, access: "O", conformance: "O", direction: "request", response: "PlaybackResponse" }),
    Command(
        { name: "Rewind", id: 0x6, access: "O", conformance: "VS", direction: "request", response: "PlaybackResponse" },
        Field({ name: "AudioAdvanceUnmuted", id: 0x0, type: "bool", conformance: "AA", default: false })
    ),

    Command(
        {
            name: "FastForward", id: 0x7, access: "O", conformance: "VS", direction: "request",
            response: "PlaybackResponse"
        },
        Field({ name: "AudioAdvanceUnmuted", id: 0x0, type: "bool", conformance: "AA", default: false })
    ),

    Command(
        {
            name: "SkipForward", id: 0x8, access: "O", conformance: "O", direction: "request",
            response: "PlaybackResponse"
        },
        Field({ name: "DeltaPositionMilliseconds", id: 0x0, type: "uint64", conformance: "M" })
    ),

    Command(
        {
            name: "SkipBackward", id: 0x9, access: "O", conformance: "O", direction: "request",
            response: "PlaybackResponse"
        },
        Field({ name: "DeltaPositionMilliseconds", id: 0x0, type: "uint64", conformance: "M" })
    ),

    Command(
        { name: "PlaybackResponse", id: 0xa, conformance: "M", direction: "response" },
        Field({ name: "Status", id: 0x0, type: "StatusEnum", conformance: "M", constraint: "desc" }),
        Field({ name: "Data", id: 0x1, type: "string", conformance: "O", constraint: "any" })
    ),
    Command(
        { name: "Seek", id: 0xb, access: "O", conformance: "AS", direction: "request", response: "PlaybackResponse" },
        Field({ name: "Position", id: 0x0, type: "uint64", conformance: "M" })
    ),

    Command(
        {
            name: "ActivateAudioTrack", id: 0xc, access: "O", conformance: "AT", direction: "request",
            response: "status"
        },
        Field({ name: "TrackId", id: 0x0, type: "string", conformance: "M", constraint: "max 32" }),
        Field({ name: "AudioOutputIndex", id: 0x1, type: "uint8", conformance: "AT", quality: "X" })
    ),

    Command(
        {
            name: "ActivateTextTrack", id: 0xd, access: "O", conformance: "TT", direction: "request",
            response: "status"
        },
        Field({ name: "TrackId", id: 0x0, type: "string", conformance: "M", constraint: "max 32" })
    ),

    Command({ name: "DeactivateTextTrack", id: 0xe, access: "O", conformance: "TT", direction: "request", response: "status" }),

    Datatype(
        { name: "PlaybackStateEnum", type: "enum8" },
        Field({ name: "Playing", id: 0x0, conformance: "M" }),
        Field({ name: "Paused", id: 0x1, conformance: "M" }),
        Field({ name: "NotPlaying", id: 0x2, conformance: "M" }),
        Field({ name: "Buffering", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "StatusEnum", type: "enum8" },
        Field({ name: "Success", id: 0x0, conformance: "M" }),
        Field({ name: "InvalidStateForCommand", id: 0x1, conformance: "M" }),
        Field({ name: "NotAllowed", id: 0x2, conformance: "M" }),
        Field({ name: "NotActive", id: 0x3, conformance: "M" }),
        Field({ name: "SpeedOutOfRange", id: 0x4, conformance: "VS" }),
        Field({ name: "SeekOutOfRange", id: 0x5, conformance: "AS" })
    ),

    Datatype(
        { name: "CharacteristicEnum", type: "enum8" },
        Field({ name: "ForcedSubtitles", id: 0x0, conformance: "M" }),
        Field({ name: "DescribesVideo", id: 0x1, conformance: "M" }),
        Field({ name: "EasyToRead", id: 0x2, conformance: "M" }),
        Field({ name: "FrameBased", id: 0x3, conformance: "M" }),
        Field({ name: "MainProgram", id: 0x4, conformance: "M" }),
        Field({ name: "OriginalContent", id: 0x5, conformance: "M" }),
        Field({ name: "VoiceOverTranslation", id: 0x6, conformance: "M" }),
        Field({ name: "Caption", id: 0x7, conformance: "M" }),
        Field({ name: "Subtitle", id: 0x8, conformance: "M" }),
        Field({ name: "Alternate", id: 0x9, conformance: "M" }),
        Field({ name: "Supplementary", id: 0xa, conformance: "M" }),
        Field({ name: "Commentary", id: 0xb, conformance: "M" }),
        Field({ name: "DubbedTranslation", id: 0xc, conformance: "M" }),
        Field({ name: "Description", id: 0xd, conformance: "M" }),
        Field({ name: "Metadata", id: 0xe, conformance: "M" }),
        Field({ name: "EnhancedAudioIntelligibility", id: 0xf, conformance: "M" }),
        Field({ name: "Emergency", id: 0x10, conformance: "M" }),
        Field({ name: "Karaoke", id: 0x11, conformance: "M" })
    ),

    Datatype(
        { name: "PlaybackPositionStruct", type: "struct" },
        Field({ name: "UpdatedAt", id: 0x0, type: "epoch-us", conformance: "M" }),
        Field({ name: "Position", id: 0x1, type: "uint64", conformance: "M", quality: "X" })
    ),
    Datatype(
        { name: "TrackStruct", type: "struct" },
        Field({ name: "Id", id: 0x0, type: "string", conformance: "M", constraint: "max 32" }),
        Field({ name: "TrackAttributes", id: 0x1, type: "TrackAttributesStruct", conformance: "M" })
    ),

    Datatype(
        { name: "TrackAttributesStruct", type: "struct" },
        Field({ name: "LanguageCode", id: 0x0, type: "string", conformance: "M", constraint: "max 32" }),
        Field(
            { name: "Characteristics", id: 0x1, type: "list", conformance: "O", default: null, quality: "X" },
            Field({ name: "entry", type: "CharacteristicEnum" })
        ),
        Field({
            name: "DisplayName", id: 0x2, type: "string", conformance: "O", constraint: "max 256",
            default: null, quality: "X"
        })
    )
);

MatterDefinition.children.push(MediaPlayback);
