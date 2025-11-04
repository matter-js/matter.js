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

export const Channel = Cluster(
    { name: "Channel", id: 0x504, classification: "application" },
    Attribute({ name: "ClusterRevision", id: 0xfffd, type: "ClusterRevision", default: 2 }),

    Attribute(
        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
        Field({ name: "CL", constraint: "0", title: "ChannelList" }),
        Field({ name: "LI", constraint: "1", title: "LineupInfo" }),
        Field({ name: "EG", constraint: "2", title: "ElectronicGuide" }),
        Field({ name: "RP", constraint: "3", title: "RecordProgram" })
    ),

    Attribute(
        { name: "ChannelList", id: 0x0, type: "list", access: "R V", conformance: "CL", default: [] },
        Field({ name: "entry", type: "ChannelInfoStruct" })
    ),
    Attribute({
        name: "Lineup", id: 0x1, type: "LineupInfoStruct", access: "R V", conformance: "LI",
        constraint: "desc", default: null, quality: "X"
    }),
    Attribute({
        name: "CurrentChannel", id: 0x2, type: "ChannelInfoStruct", access: "R V", conformance: "O",
        constraint: "desc", default: null, quality: "X"
    }),

    Command(
        {
            name: "ChangeChannel", id: 0x0, access: "O", conformance: "CL | LI", direction: "request",
            response: "ChangeChannelResponse"
        },
        Field({ name: "Match", id: 0x0, type: "string", conformance: "M" })
    ),

    Command(
        { name: "ChangeChannelResponse", id: 0x1, conformance: "CL | LI", direction: "response" },
        Field({ name: "Status", id: 0x0, type: "StatusEnum", conformance: "M", constraint: "desc" }),
        Field({ name: "Data", id: 0x1, type: "string", conformance: "O", constraint: "any" })
    ),

    Command(
        {
            name: "ChangeChannelByNumber", id: 0x2, access: "O", conformance: "M", direction: "request",
            response: "status"
        },
        Field({ name: "MajorNumber", id: 0x0, type: "uint16", conformance: "M" }),
        Field({ name: "MinorNumber", id: 0x1, type: "uint16", conformance: "M" })
    ),

    Command(
        { name: "SkipChannel", id: 0x3, access: "O", conformance: "M", direction: "request", response: "status" },
        Field({ name: "Count", id: 0x0, type: "int16", conformance: "M" })
    ),

    Command(
        {
            name: "GetProgramGuide", id: 0x4, access: "O", conformance: "EG", direction: "request",
            response: "ProgramGuideResponse"
        },
        Field({ name: "StartTime", id: 0x0, type: "epoch-s", conformance: "M" }),
        Field({ name: "EndTime", id: 0x1, type: "epoch-s", conformance: "M" }),
        Field(
            { name: "ChannelList", id: 0x2, type: "list", conformance: "O", constraint: "max 255", default: [] },
            Field({ name: "entry", type: "ChannelInfoStruct" })
        ),
        Field({ name: "PageToken", id: 0x3, type: "PageTokenStruct", conformance: "O", default: null, quality: "X" }),
        Field({ name: "RecordingFlag", id: 0x5, type: "RecordingFlagBitmap", conformance: "O", default: null, quality: "X" }),
        Field(
            { name: "ExternalIdList", id: 0x6, type: "list", conformance: "O", constraint: "max 255", default: [] },
            Field({ name: "entry", type: "ContentLauncher.AdditionalInfoStruct" })
        ),
        Field({ name: "Data", id: 0x7, type: "octstr", conformance: "O", constraint: "max 8092" })
    ),

    Command(
        { name: "ProgramGuideResponse", id: 0x5, conformance: "EG", direction: "response" },
        Field({ name: "Paging", id: 0x0, type: "ChannelPagingStruct", conformance: "M" }),
        Field(
            { name: "ProgramList", id: 0x1, type: "list", conformance: "M", default: [] },
            Field({ name: "entry", type: "ProgramStruct" })
        )
    ),

    Command(
        {
            name: "RecordProgram", id: 0x6, access: "O", conformance: "RP & EG", direction: "request",
            response: "status"
        },
        Field({ name: "ProgramIdentifier", id: 0x0, type: "string", conformance: "M", constraint: "max 255" }),
        Field({ name: "ShouldRecordSeries", id: 0x1, type: "bool", conformance: "M" }),
        Field(
            { name: "ExternalIdList", id: 0x2, type: "list", conformance: "O", constraint: "max 255", default: [] },
            Field({ name: "entry", type: "ContentLauncher.AdditionalInfoStruct" })
        ),
        Field({ name: "Data", id: 0x3, type: "octstr", conformance: "O", constraint: "max 8092" })
    ),

    Command(
        {
            name: "CancelRecordProgram", id: 0x7, access: "O", conformance: "RP & EG", direction: "request",
            response: "status"
        },
        Field({ name: "ProgramIdentifier", id: 0x0, type: "string", conformance: "M", constraint: "max 255" }),
        Field({ name: "ShouldRecordSeries", id: 0x1, type: "bool", conformance: "M" }),
        Field(
            { name: "ExternalIdList", id: 0x2, type: "list", conformance: "O", constraint: "max 255", default: [] },
            Field({ name: "entry", type: "ContentLauncher.AdditionalInfoStruct" })
        ),
        Field({ name: "Data", id: 0x3, type: "octstr", conformance: "O", constraint: "max 8092" })
    ),

    Datatype(
        { name: "RecordingFlagBitmap", type: "map8" },
        Field({ name: "Scheduled", constraint: "0" }),
        Field({ name: "RecordSeries", constraint: "1" }),
        Field({ name: "Recorded", constraint: "2" })
    ),

    Datatype({ name: "LineupInfoTypeEnum", type: "enum8" }, Field({ name: "Mso", id: 0x0, conformance: "M" })),

    Datatype(
        { name: "StatusEnum", type: "enum8" },
        Field({ name: "Success", id: 0x0, conformance: "M" }),
        Field({ name: "MultipleMatches", id: 0x1, conformance: "M" }),
        Field({ name: "NoMatches", id: 0x2, conformance: "M" })
    ),

    Datatype(
        { name: "ChannelTypeEnum", type: "enum8" },
        Field({ name: "Satellite", id: 0x0, conformance: "M" }),
        Field({ name: "Cable", id: 0x1, conformance: "M" }),
        Field({ name: "Terrestrial", id: 0x2, conformance: "M" }),
        Field({ name: "Ott", id: 0x3, conformance: "M" })
    ),

    Datatype(
        { name: "ChannelInfoStruct", type: "struct" },
        Field({ name: "MajorNumber", id: 0x0, type: "uint16", conformance: "M" }),
        Field({ name: "MinorNumber", id: 0x1, type: "uint16", conformance: "M" }),
        Field({ name: "Name", id: 0x2, type: "string", conformance: "O" }),
        Field({ name: "CallSign", id: 0x3, type: "string", conformance: "O" }),
        Field({ name: "AffiliateCallSign", id: 0x4, type: "string", conformance: "O" }),
        Field({ name: "Identifier", id: 0x5, type: "string", conformance: "O" }),
        Field({ name: "Type", id: 0x6, type: "ChannelTypeEnum", conformance: "O" })
    ),

    Datatype(
        { name: "LineupInfoStruct", type: "struct" },
        Field({ name: "OperatorName", id: 0x0, type: "string", conformance: "M" }),
        Field({ name: "LineupName", id: 0x1, type: "string", conformance: "O" }),
        Field({ name: "PostalCode", id: 0x2, type: "string", conformance: "O" }),
        Field({ name: "LineupInfoType", id: 0x3, type: "LineupInfoTypeEnum", conformance: "M", constraint: "desc" })
    ),

    Datatype(
        { name: "ProgramStruct", type: "struct" },
        Field({ name: "Identifier", id: 0x0, type: "string", conformance: "M", constraint: "max 255" }),
        Field({ name: "Channel", id: 0x1, type: "ChannelInfoStruct", conformance: "M" }),
        Field({ name: "StartTime", id: 0x2, type: "epoch-s", conformance: "M" }),
        Field({ name: "EndTime", id: 0x3, type: "epoch-s", conformance: "M" }),
        Field({ name: "Title", id: 0x4, type: "string", conformance: "M", constraint: "max 255" }),
        Field({ name: "Subtitle", id: 0x5, type: "string", conformance: "O", constraint: "max 255" }),
        Field({ name: "Description", id: 0x6, type: "string", conformance: "O", constraint: "max 8192" }),

        Field(
            {
                name: "AudioLanguages", id: 0x7, type: "list", conformance: "O", constraint: "max 10[max 50]",
                default: []
            },
            Field({ name: "entry", type: "string" })
        ),

        Field(
            { name: "Ratings", id: 0x8, type: "list", conformance: "O", constraint: "max 255", default: [] },
            Field({ name: "entry", type: "string" })
        ),
        Field({ name: "ThumbnailUrl", id: 0x9, type: "string", conformance: "O", constraint: "max 8192" }),
        Field({ name: "PosterArtUrl", id: 0xa, type: "string", conformance: "O", constraint: "max 8192" }),
        Field({ name: "DvbiUrl", id: 0xb, type: "string", conformance: "O", constraint: "max 8192" }),
        Field({ name: "ReleaseDate", id: 0xc, type: "string", conformance: "O", constraint: "max 30" }),
        Field({ name: "ParentalGuidanceText", id: 0xd, type: "string", conformance: "O", constraint: "max 255" }),
        Field({ name: "RecordingFlag", id: 0xe, type: "RecordingFlagBitmap", conformance: "RP" }),
        Field({ name: "SeriesInfo", id: 0xf, type: "SeriesInfoStruct", conformance: "O", default: null, quality: "X" }),
        Field(
            { name: "CategoryList", id: 0x10, type: "list", conformance: "O", constraint: "max 255", default: [] },
            Field({ name: "entry", type: "ProgramCategoryStruct" })
        ),
        Field(
            { name: "CastList", id: 0x11, type: "list", conformance: "O", constraint: "max 255", default: [] },
            Field({ name: "entry", type: "ProgramCastStruct" })
        ),
        Field(
            { name: "ExternalIdList", id: 0x12, type: "list", conformance: "O", constraint: "max 255", default: [] },
            Field({ name: "entry", type: "ContentLauncher.AdditionalInfoStruct" })
        )
    ),

    Datatype(
        { name: "ProgramCategoryStruct", type: "struct" },
        Field({ name: "Category", id: 0x0, type: "string", conformance: "M", constraint: "max 256" }),
        Field({ name: "SubCategory", id: 0x1, type: "string", conformance: "O", constraint: "max 256" })
    ),
    Datatype(
        { name: "SeriesInfoStruct", type: "struct" },
        Field({ name: "Season", id: 0x0, type: "string", conformance: "M", constraint: "max 256" }),
        Field({ name: "Episode", id: 0x1, type: "string", conformance: "M", constraint: "max 256" })
    ),
    Datatype(
        { name: "ProgramCastStruct", type: "struct" },
        Field({ name: "Name", id: 0x0, type: "string", conformance: "M", constraint: "max 256" }),
        Field({ name: "Role", id: 0x1, type: "string", conformance: "M", constraint: "max 256" })
    ),

    Datatype(
        { name: "PageTokenStruct", type: "struct" },
        Field({ name: "Limit", id: 0x0, type: "uint16", conformance: "O", default: 0 }),
        Field({ name: "After", id: 0x1, type: "string", conformance: "O", constraint: "max 8192" }),
        Field({ name: "Before", id: 0x2, type: "string", conformance: "O", constraint: "max 8192" })
    ),

    Datatype(
        { name: "ChannelPagingStruct", type: "struct" },
        Field({ name: "PreviousToken", id: 0x0, type: "PageTokenStruct", conformance: "O", default: null, quality: "X" }),
        Field({ name: "NextToken", id: 0x1, type: "PageTokenStruct", conformance: "O", default: null, quality: "X" })
    )
);

MatterDefinition.children.push(Channel);
