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

export const ContentLauncher = Cluster(
    { name: "ContentLauncher", id: 0x50a, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "CS", constraint: "0", title: "ContentSearch" }),
        Field({ name: "UP", constraint: "1", title: "UrlPlayback" }),
        Field({ name: "AS", constraint: "2", title: "AdvancedSeek" }),
        Field({ name: "TT", constraint: "3", title: "TextTracks" }),
        Field({ name: "AT", constraint: "4", title: "AudioTracks" })
    ),

    Attribute(
        {
            name: "AcceptHeader", id: 0x0, type: "list", access: "R V", conformance: "UP",
            constraint: "max 100[max 1024]", default: [], quality: "N"
        },
        Field({ name: "entry", type: "string" })
    ),

    Attribute({
        name: "SupportedStreamingProtocols", id: 0x1, type: "SupportedProtocolsBitmap", access: "R V",
        conformance: "UP", default: 0, quality: "N"
    }),

    Command(
        {
            name: "LaunchContent", id: 0x0, access: "O", conformance: "CS", direction: "request",
            response: "LauncherResponse"
        },
        Field({ name: "Search", id: 0x0, type: "ContentSearchStruct", conformance: "M", constraint: "desc" }),
        Field({ name: "AutoPlay", id: 0x1, type: "bool", conformance: "M", constraint: "desc" }),
        Field({ name: "Data", id: 0x2, type: "string", conformance: "O" }),
        Field({ name: "PlaybackPreferences", id: 0x3, type: "PlaybackPreferencesStruct", conformance: "O" }),
        Field({ name: "UseCurrentContext", id: 0x4, type: "bool", conformance: "O", constraint: "desc", default: true })
    ),

    Command(
        {
            name: "LaunchUrl", id: 0x1, access: "O", conformance: "UP", direction: "request",
            response: "LauncherResponse"
        },
        Field({ name: "ContentUrl", id: 0x0, type: "string", conformance: "M", constraint: "any" }),
        Field({ name: "DisplayString", id: 0x1, type: "string", conformance: "O", constraint: "any" }),
        Field({
            name: "BrandingInformation", id: 0x2, type: "BrandingInformationStruct", conformance: "O",
            constraint: "any"
        }),
        Field({
            name: "PlaybackPreferences", id: 0x3, type: "PlaybackPreferencesStruct", conformance: "O",
            constraint: "any"
        })
    ),

    Command(
        { name: "LauncherResponse", id: 0x2, conformance: "CS | UP", direction: "response" },
        Field({ name: "Status", id: 0x0, type: "StatusEnum", conformance: "M" }),
        Field({ name: "Data", id: 0x1, type: "string", conformance: "O" })
    ),
    Datatype(
        { name: "SupportedProtocolsBitmap", type: "map32" },
        Field({ name: "Dash", constraint: "0" }),
        Field({ name: "Hls", constraint: "1" })
    ),

    Datatype(
        { name: "StatusEnum", type: "enum8" },
        Field({ name: "Success", id: 0x0, conformance: "M" }),
        Field({ name: "UrlNotAvailable", id: 0x1, conformance: "M" }),
        Field({ name: "AuthFailed", id: 0x2, conformance: "M" }),
        Field({ name: "TextTrackNotAvailable", id: 0x3, conformance: "TT" }),
        Field({ name: "AudioTrackNotAvailable", id: 0x4, conformance: "AT" })
    ),

    Datatype(
        { name: "ParameterEnum", type: "enum8" },
        Field({ name: "Actor", id: 0x0, conformance: "M" }),
        Field({ name: "Channel", id: 0x1, conformance: "M" }),
        Field({ name: "Character", id: 0x2, conformance: "M" }),
        Field({ name: "Director", id: 0x3, conformance: "M" }),
        Field({ name: "Event", id: 0x4, conformance: "M" }),
        Field({ name: "Franchise", id: 0x5, conformance: "M" }),
        Field({ name: "Genre", id: 0x6, conformance: "M" }),
        Field({ name: "League", id: 0x7, conformance: "M" }),
        Field({ name: "Popularity", id: 0x8, conformance: "M" }),
        Field({ name: "Provider", id: 0x9, conformance: "M" }),
        Field({ name: "Sport", id: 0xa, conformance: "M" }),
        Field({ name: "SportsTeam", id: 0xb, conformance: "M" }),
        Field({ name: "Type", id: 0xc, conformance: "M" }),
        Field({ name: "Video", id: 0xd, conformance: "M" }),
        Field({ name: "Season", id: 0xe, conformance: "O" }),
        Field({ name: "Episode", id: 0xf, conformance: "O" }),
        Field({ name: "Any", id: 0x10, conformance: "O" })
    ),

    Datatype(
        { name: "MetricTypeEnum", type: "enum8" },
        Field({ name: "Pixels", id: 0x0, conformance: "M" }),
        Field({ name: "Percentage", id: 0x1, conformance: "M" })
    ),
    Datatype(
        { name: "AdditionalInfoStruct", type: "struct" },
        Field({ name: "Name", id: 0x0, type: "string", conformance: "M", constraint: "max 256" }),
        Field({ name: "Value", id: 0x1, type: "string", conformance: "M", constraint: "max 8192" })
    ),

    Datatype(
        { name: "ParameterStruct", type: "struct" },
        Field({ name: "Type", id: 0x0, type: "ParameterEnum", conformance: "M" }),
        Field({ name: "Value", id: 0x1, type: "string", conformance: "M", constraint: "max 1024" }),
        Field(
            { name: "ExternalIdList", id: 0x2, type: "list", conformance: "O", default: [] },
            Field({ name: "entry", type: "AdditionalInfoStruct" })
        )
    ),

    Datatype(
        { name: "ContentSearchStruct", type: "struct" },
        Field(
            { name: "ParameterList", id: 0x0, type: "list", conformance: "M" },
            Field({ name: "entry", type: "ParameterStruct" })
        )
    ),

    Datatype(
        { name: "DimensionStruct", type: "struct" },
        Field({ name: "Width", id: 0x0, type: "double", conformance: "M" }),
        Field({ name: "Height", id: 0x1, type: "double", conformance: "M" }),
        Field({ name: "Metric", id: 0x2, type: "MetricTypeEnum", conformance: "M" })
    ),

    Datatype(
        { name: "StyleInformationStruct", type: "struct" },
        Field({ name: "ImageUrl", id: 0x0, type: "string", conformance: "O", constraint: "max 8192" }),
        Field({ name: "Color", id: 0x1, type: "string", conformance: "O", constraint: "7, 9" }),
        Field({ name: "Size", id: 0x2, type: "DimensionStruct", conformance: "O" })
    ),

    Datatype(
        { name: "BrandingInformationStruct", type: "struct" },
        Field({ name: "ProviderName", id: 0x0, type: "string", conformance: "M", constraint: "max 256" }),
        Field({ name: "Background", id: 0x1, type: "StyleInformationStruct", conformance: "O" }),
        Field({ name: "Logo", id: 0x2, type: "StyleInformationStruct", conformance: "O" }),
        Field({ name: "ProgressBar", id: 0x3, type: "StyleInformationStruct", conformance: "O" }),
        Field({ name: "Splash", id: 0x4, type: "StyleInformationStruct", conformance: "O" }),
        Field({ name: "Watermark", id: 0x5, type: "StyleInformationStruct", conformance: "O" })
    ),

    Datatype(
        { name: "PlaybackPreferencesStruct", type: "struct" },
        Field({ name: "PlaybackPosition", id: 0x0, type: "uint64", conformance: "AS", quality: "X" }),
        Field({ name: "TextTrack", id: 0x1, type: "TrackPreferenceStruct", conformance: "TT", quality: "X" }),
        Field(
            { name: "AudioTracks", id: 0x2, type: "list", conformance: "AT", quality: "X" },
            Field({ name: "entry", type: "TrackPreferenceStruct" })
        )
    ),

    Datatype(
        { name: "TrackPreferenceStruct", type: "struct" },
        Field({ name: "LanguageCode", id: 0x0, type: "string", conformance: "M", constraint: "max 32" }),
        Field(
            { name: "Characteristics", id: 0x1, type: "list", conformance: "O", default: null, quality: "X" },
            Field({ name: "entry", type: "MediaPlayback.CharacteristicEnum" })
        ),
        Field({ name: "AudioOutputIndex", id: 0x2, type: "uint8", conformance: "AT", quality: "X" })
    )
);

MatterDefinition.children.push(ContentLauncher);
