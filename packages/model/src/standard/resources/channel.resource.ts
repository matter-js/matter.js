/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "Channel", pics: "CHANNEL", xref: "cluster§6.6",

    details: "This cluster provides an interface for controlling the current Channel on a device or endpoint." +
        "\n" +
        "This cluster server would be supported on Video Player devices or endpoints that allow Channel " +
        "control such as a Content App. This cluster provides a list of available channels and provides " +
        "commands for absolute and relative channel changes. Some of these commands and/or their responses " +
        "may be large (see Large Message Quality under Data Model section in [MatterCore]), but they do not " +
        "have the Large quality indicator (L) because they can also be transferred over MRP (see Message " +
        "Reliability Protocol in [MatterCore]) in pages that fit within the MRP MTU limit. However, an " +
        "implementation may leverage a transport like TCP that allows large payloads, if available, to " +
        "minimize the number of messages required to transfer the corresponding payload." +
        "\n" +
        "The cluster server for Channel is implemented by an endpoint that controls the current Channel.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§6.6.4",

            children: [
                { tag: "field", name: "CL", details: "Provides list of available channels." },
                {
                    tag: "field", name: "LI",
                    details: "Provides lineup info, which is a reference to an external source of lineup information."
                },
                { tag: "field", name: "EG", details: "Provides electronic program guide information." },
                { tag: "field", name: "RP", details: "Provides ability to record program." }
            ]
        },

        {
            tag: "attribute", name: "ChannelList", xref: "cluster§6.6.6.1",
            details: "This attribute shall provide the list of supported channels."
        },
        {
            tag: "attribute", name: "Lineup", xref: "cluster§6.6.6.2",
            details: "This attribute shall identify the channel lineup using external data sources."
        },
        {
            tag: "attribute", name: "CurrentChannel", xref: "cluster§6.6.6.3",
            details: "This attribute shall contain the current channel. When supported but a channel is not currently " +
                "tuned to (if a content application is in foreground), the value of the field shall be null."
        },

        {
            tag: "command", name: "ChangeChannel", xref: "cluster§6.6.7.1",

            details: "Change the channel to the channel case-insensitive exact matching the value passed as an argument." +
                "\n" +
                "The match priority order shall be: Identifier, AffiliateCallSign, CallSign, Name, Number. In the " +
                "match string, the Channel number should be presented in the \"Major.Minor\" format, such as \"13.1\"." +
                "\n" +
                "Upon receipt, this shall generate a ChangeChannelResponse command." +
                "\n" +
                "Upon success, the CurrentChannel attribute, if supported, shall be updated to reflect the change.",

            children: [{
                tag: "field", name: "Match", xref: "cluster§6.6.7.1.1",
                details: "This field shall contain a user-input string to match in order to identify the target channel."
            }]
        },

        {
            tag: "command", name: "ChangeChannelResponse", xref: "cluster§6.6.7.2",
            details: "This command shall be generated in response to a ChangeChannel command.",

            children: [
                {
                    tag: "field", name: "Status", xref: "cluster§6.6.7.2.1",
                    details: "This field shall indicate the status of the command which resulted in this response."
                },
                {
                    tag: "field", name: "Data", xref: "cluster§6.6.7.2.2",
                    details: "This field shall indicate Optional app-specific data."
                }
            ]
        },

        {
            tag: "command", name: "ChangeChannelByNumber", xref: "cluster§6.6.7.3",
            details: "Change the channel to the channel with the given Number in the ChannelList attribute.",

            children: [
                {
                    tag: "field", name: "MajorNumber", xref: "cluster§6.6.7.3.1",
                    details: "This field shall indicate the channel major number value (ATSC format) to which the channel should " +
                        "change."
                },
                {
                    tag: "field", name: "MinorNumber", xref: "cluster§6.6.7.3.2",
                    details: "This field shall indicate the channel minor number value (ATSC format) to which the channel should " +
                        "change."
                }
            ]
        },

        {
            tag: "command", name: "SkipChannel", xref: "cluster§6.6.7.4",

            details: "This command provides channel up and channel down functionality, but allows channel index jumps of " +
                "size Count." +
                "\n" +
                "Jumps are relative to the available list of channels. For example, when the current channel is 100.0 " +
                "and the list of available channels is [100.0, 200.0, 201.0, 305.1], a SkipChannel command with jump " +
                "value of 2 shall change the channel to 201.0." +
                "\n" +
                "When the value of the increase or decrease is larger than the number of channels remaining in the " +
                "given direction, then the behavior shall be to return to the beginning (or end) of the channel list " +
                "and continue. For example, if the current channel is at index 0 and count value of -1 is given, then " +
                "the current channel should change to the last channel.",

            children: [{
                tag: "field", name: "Count", xref: "cluster§6.6.7.4.1",
                details: "This field shall indicate the number of steps to increase (Count is positive) or decrease (Count is " +
                    "negative) the current channel."
            }]
        },

        {
            tag: "command", name: "GetProgramGuide", xref: "cluster§6.6.7.5",
            details: "This command retrieves the program guide. It accepts several filter parameters to return specific " +
                "schedule and program information from a content app. The command shall receive in response a " +
                "ProgramGuideResponse. Standard error codes shall be used when arguments provided are not valid. For " +
                "example, if StartTime is greater than EndTime, the status code INVALID_ACTION shall be returned.",

            children: [
                {
                    tag: "field", name: "StartTime", xref: "cluster§6.6.7.5.1",
                    details: "This field shall indicate the beginning of the time window for which program guide entries are to be " +
                        "retrieved, as a UTC time. Entries with a start time on or after this value will be included in the " +
                        "results."
                },

                {
                    tag: "field", name: "EndTime", xref: "cluster§6.6.7.5.2",
                    details: "This field shall indicate the end of the time window for which program guide entries are to be " +
                        "retrieved, as a UTC time. Entries with an end time on or before this value will be included in the " +
                        "results. This field can represent a past or future value but shall be greater than the StartTime."
                },

                {
                    tag: "field", name: "ChannelList", xref: "cluster§6.6.7.5.3",
                    details: "This field shall indicate the set of channels for which program guide entries should be fetched. By " +
                        "providing a list of channels in this field, the response will only include entries corresponding to " +
                        "the specified channels."
                },

                {
                    tag: "field", name: "PageToken", xref: "cluster§6.6.7.5.4",
                    details: "This field shall indicate the pagination token used for managing pagination progression."
                },
                {
                    tag: "field", name: "RecordingFlag", xref: "cluster§6.6.7.5.5",
                    details: "This field shall indicate the flags of the programs for which entries should be fetched."
                },
                {
                    tag: "field", name: "ExternalIdList", xref: "cluster§6.6.7.5.6",
                    details: "This field shall indicate the list of additional external content identifiers."
                },
                {
                    tag: "field", name: "Data", xref: "cluster§6.6.7.5.7",
                    details: "This field shall indicate Optional app-specific data."
                }
            ]
        },

        {
            tag: "command", name: "ProgramGuideResponse", xref: "cluster§6.6.7.6",
            details: "This command is a response to the GetProgramGuide command.",

            children: [
                {
                    tag: "field", name: "Paging", xref: "cluster§6.6.7.6.1",
                    details: "This field shall indicate the necessary pagination attributes that define information for both the " +
                        "succeeding and preceding data pages."
                },
                {
                    tag: "field", name: "ProgramList", xref: "cluster§6.6.7.6.2",
                    details: "This field shall indicate the list of programs."
                }
            ]
        },

        {
            tag: "command", name: "RecordProgram", xref: "cluster§6.6.7.7",
            details: "Record a specific program or series when it goes live. This functionality enables DVR recording " +
                "features.",

            children: [
                {
                    tag: "field", name: "ProgramIdentifier", xref: "cluster§6.6.7.7.1",
                    details: "This field shall indicate the program identifier for the program that should be recorded. This value " +
                        "is provided by the identifier field in ProgramStruct."
                },

                {
                    tag: "field", name: "ShouldRecordSeries", xref: "cluster§6.6.7.7.2",
                    details: "This field shall indicate whether the whole series associated to the program should be recorded. For " +
                        "example, invoking record program on an episode with that flag set to true, the target should " +
                        "schedule record the whole series."
                },

                {
                    tag: "field", name: "ExternalIdList", xref: "cluster§6.6.7.7.3",
                    details: "This field, if present, shall indicate the list of additional external content identifiers."
                },
                {
                    tag: "field", name: "Data", xref: "cluster§6.6.7.7.4",
                    details: "This field, if present, shall indicate app-specific data."
                }
            ]
        },

        {
            tag: "command", name: "CancelRecordProgram", xref: "cluster§6.6.7.8",
            details: "Cancel recording for a specific program or series.",

            children: [
                {
                    tag: "field", name: "ProgramIdentifier", xref: "cluster§6.6.7.8.1",
                    details: "This field shall indicate the program identifier for the program that should be cancelled from " +
                        "recording. This value is provided by the identifier field in ProgramStruct."
                },

                {
                    tag: "field", name: "ShouldRecordSeries", xref: "cluster§6.6.7.8.2",
                    details: "This field shall indicate whether the whole series associated to the program should be cancelled " +
                        "from recording. For example, invoking record program on an episode with that flag set to true, the " +
                        "target should schedule record the whole series."
                },

                {
                    tag: "field", name: "ExternalIdList", xref: "cluster§6.6.7.8.3",
                    details: "This field, if present, shall indicate the list of additional external content identifiers."
                },
                {
                    tag: "field", name: "Data", xref: "cluster§6.6.7.8.4",
                    details: "This field, if present, shall indicate app-specific data."
                }
            ]
        },

        {
            tag: "datatype", name: "RecordingFlagBitmap", xref: "cluster§6.6.5.1",
            children: [
                { tag: "field", name: "Scheduled", description: "The program is scheduled for recording." },
                { tag: "field", name: "RecordSeries", description: "The program series is scheduled for recording." },
                { tag: "field", name: "Recorded", description: "The program is recorded and available to be played." }
            ]
        },

        {
            tag: "datatype", name: "LineupInfoTypeEnum", xref: "cluster§6.6.5.2",
            children: [{ tag: "field", name: "Mso", description: "Multi System Operator" }]
        },

        {
            tag: "datatype", name: "StatusEnum", xref: "cluster§6.6.5.3",

            children: [
                { tag: "field", name: "Success", description: "Command succeeded" },
                {
                    tag: "field", name: "MultipleMatches",
                    description: "More than one equal match for the ChannelInfoStruct passed in."
                },
                { tag: "field", name: "NoMatches", description: "No matches for the ChannelInfoStruct passed in." }
            ]
        },

        {
            tag: "datatype", name: "ChannelTypeEnum", xref: "cluster§6.6.5.4",

            children: [
                { tag: "field", name: "Satellite", description: "The channel is sourced from a satellite provider." },
                { tag: "field", name: "Cable", description: "The channel is sourced from a cable provider." },
                {
                    tag: "field", name: "Terrestrial",
                    description: "The channel is sourced from a terrestrial provider."
                },
                { tag: "field", name: "Ott", description: "The channel is sourced from an OTT provider." }
            ]
        },

        {
            tag: "datatype", name: "ChannelInfoStruct", xref: "cluster§6.6.5.5",
            details: "This indicates a channel in a channel lineup." +
                "\n" +
                "While the major and minor numbers in the ChannelInfoStruct support use of ATSC channel format, a " +
                "lineup may use other formats which can map into these numeric values.",

            children: [
                {
                    tag: "field", name: "MajorNumber", xref: "cluster§6.6.5.5.1",
                    details: "This field shall indicate the channel major number value (for example, using ATSC format). When the " +
                        "channel number is expressed as a string, such as \"13.1\" or \"256\", the major number would be 13 or " +
                        "256, respectively. This field is required but shall be set to 0 for channels such as over-the-top " +
                        "channels that are not represented by a major or minor number."
                },

                {
                    tag: "field", name: "MinorNumber", xref: "cluster§6.6.5.5.2",
                    details: "This field shall indicate the channel minor number value (for example, using ATSC format). When the " +
                        "channel number is expressed as a string, such as \"13.1\" or \"256\", the minor number would be 1 or 0, " +
                        "respectively. This field is required but shall be set to 0 for channels such as over-the-top " +
                        "channels that are not represented by a major or minor number."
                },

                {
                    tag: "field", name: "Name", xref: "cluster§6.6.5.5.3",
                    details: "This field shall indicate the marketing name for the channel, such as “The CW\" or \"Comedy Central\". " +
                        "This field is optional, but SHOULD be provided when known."
                },
                {
                    tag: "field", name: "CallSign", xref: "cluster§6.6.5.5.4",
                    details: "This field shall indicate the call sign of the channel, such as \"PBS\". This field is optional, but " +
                        "SHOULD be provided when known."
                },
                {
                    tag: "field", name: "AffiliateCallSign", xref: "cluster§6.6.5.5.5",
                    details: "This field shall indicate the local affiliate call sign, such as \"KCTS\". This field is optional, but " +
                        "SHOULD be provided when known."
                },
                {
                    tag: "field", name: "Identifier", xref: "cluster§6.6.5.5.6",
                    details: "This shall indicate the unique identifier for a specific channel. This field is optional, but SHOULD " +
                        "be provided when MajorNumber and MinorNumber are not available."
                },
                {
                    tag: "field", name: "Type", xref: "cluster§6.6.5.5.7",
                    details: "This shall indicate the type or grouping of a specific channel. This field is optional, but SHOULD " +
                        "be provided when known."
                }
            ]
        },

        {
            tag: "datatype", name: "LineupInfoStruct", xref: "cluster§6.6.5.6",
            details: "The Lineup Info allows references to external lineup sources like Gracenote. The combination of " +
                "OperatorName, LineupName, and PostalCode MUST uniquely identify a lineup.",

            children: [
                {
                    tag: "field", name: "OperatorName", xref: "cluster§6.6.5.6.1",
                    details: "This field shall indicate the name of the operator, for example “Comcast”."
                },
                {
                    tag: "field", name: "LineupName", xref: "cluster§6.6.5.6.2",
                    details: "This field shall indicate the name of the provider lineup, for example \"Comcast King County\". This " +
                        "field is optional, but SHOULD be provided when known."
                },
                {
                    tag: "field", name: "PostalCode", xref: "cluster§6.6.5.6.3",
                    details: "This field shall indicate the postal code (zip code) for the location of the device, such as " +
                        "\"98052\". This field is optional, but SHOULD be provided when known."
                },
                {
                    tag: "field", name: "LineupInfoType", xref: "cluster§6.6.5.6.4",
                    details: "This field shall indicate the type of lineup. This field is optional, but SHOULD be provided when " +
                        "known."
                }
            ]
        },

        {
            tag: "datatype", name: "ProgramStruct", xref: "cluster§6.6.5.7",
            details: "This indicates a program within an electronic program guide (EPG).",

            children: [
                {
                    tag: "field", name: "Identifier", xref: "cluster§6.6.5.7.1",
                    details: "This field shall indicate a unique identifier for a program within an electronic program guide list. " +
                        "The identifier shall be unique across multiple channels."
                },
                {
                    tag: "field", name: "Channel", xref: "cluster§6.6.5.7.2",
                    details: "This field shall indicate the channel associated to the program."
                },
                {
                    tag: "field", name: "StartTime", xref: "cluster§6.6.5.7.3",
                    details: "This field shall indicate an epoch time in seconds indicating the start time of a program, as a UTC " +
                        "time. This field can represent a past or future value."
                },
                {
                    tag: "field", name: "EndTime", xref: "cluster§6.6.5.7.4",
                    details: "This field shall indicate an epoch time in seconds indicating the end time of a program, as a UTC " +
                        "time. This field can represent a past or future value but shall be greater than the StartTime."
                },
                {
                    tag: "field", name: "Title", xref: "cluster§6.6.5.7.5",
                    details: "This field shall indicate the title or name for the specific program. For example, “MCIS: Los " +
                        "Angeles”."
                },

                {
                    tag: "field", name: "Subtitle", xref: "cluster§6.6.5.7.6",
                    details: "This field shall indicate the subtitle for the specific program. For example, “Maybe Today\" which is " +
                        "an episode name for “MCIS: Los Angeles”. This field is optional but shall be provided if applicable " +
                        "and known."
                },

                {
                    tag: "field", name: "Description", xref: "cluster§6.6.5.7.7",
                    details: "This field shall indicate the brief description for the specific program. For example, a description " +
                        "of an episode. This field is optional but shall be provided if known."
                },

                {
                    tag: "field", name: "AudioLanguages", xref: "cluster§6.6.5.7.8",
                    details: "This field shall indicate the audio language for the specific program. The value is a string " +
                        "containing one of the standard Tags for Identifying Languages RFC 5646. This field is optional but " +
                        "shall be provided if known."
                },

                {
                    tag: "field", name: "Ratings", xref: "cluster§6.6.5.7.9",
                    details: "This field shall be used for indicating the level of parental guidance recommended for of a " +
                        "particular program. This can be any rating system used in the country or region where the program is " +
                        "broadcast. For example, in the United States “TV-PG” may contain material that parents can find not " +
                        "suitable for younger children but can be accepted in general for older children. This field is " +
                        "optional but shall be provided if known."
                },

                {
                    tag: "field", name: "ThumbnailUrl", xref: "cluster§6.6.5.7.10",
                    details: "This field shall represent a URL of a thumbnail that clients can use to render an image for the " +
                        "program. The syntax of this field shall follow the syntax as specified in RFC 1738 and shall use the " +
                        "https scheme."
                },

                {
                    tag: "field", name: "PosterArtUrl", xref: "cluster§6.6.5.7.11",
                    details: "This field shall represent a URL of a poster that clients can use to render an image for the program " +
                        "on the detail view. The syntax of this field shall follow the syntax as specified in RFC 1738 and " +
                        "shall use the https scheme."
                },

                {
                    tag: "field", name: "DvbiUrl", xref: "cluster§6.6.5.7.12",
                    details: "This field shall represent the DVB-I URL associated to the program. The syntax of this field shall " +
                        "follow the syntax as specified in RFC 1738 and shall use the https scheme."
                },

                {
                    tag: "field", name: "ReleaseDate", xref: "cluster§6.6.5.7.13",
                    details: "This field shall be a string, in ISO 8601 format, representing the date on which the program was " +
                        "released. This field is optional but when provided, the year shall be provided as part of the " +
                        "string."
                },

                {
                    tag: "field", name: "ParentalGuidanceText", xref: "cluster§6.6.5.7.14",
                    details: "This field shall represent a string providing additional information on the parental guidance. This " +
                        "field is optional."
                },
                {
                    tag: "field", name: "RecordingFlag", xref: "cluster§6.6.5.7.15",
                    details: "This field shall represent the recording status of the program. This field is required if the " +
                        "RecordProgram feature is set."
                },

                {
                    tag: "field", name: "SeriesInfo", xref: "cluster§6.6.5.7.16",
                    details: "This field shall represent the information of a series such as season and episode number. This field " +
                        "is optional but SHOULD be provided if the program represents a series and this information is " +
                        "available."
                },

                {
                    tag: "field", name: "CategoryList", xref: "cluster§6.6.5.7.17",
                    details: "This field shall represent the category of a particular program. This field is optional but shall be " +
                        "provided if known."
                },
                {
                    tag: "field", name: "CastList", xref: "cluster§6.6.5.7.18",
                    details: "This field shall represent a list of the cast or the crew on the program. A single cast member may " +
                        "have more than one role. This field is optional but shall be provided if known."
                },
                {
                    tag: "field", name: "ExternalIdList", xref: "cluster§6.6.5.7.19",
                    details: "This field shall indicate the list of additional external content identifiers."
                }
            ]
        },

        {
            tag: "datatype", name: "ProgramCategoryStruct", xref: "cluster§6.6.5.8",
            details: "This object defines the category associated to a program.",

            children: [
                {
                    tag: "field", name: "Category", xref: "cluster§6.6.5.8.1",
                    details: "This field shall represent the category or genre of the program. Ex. News."
                },
                {
                    tag: "field", name: "SubCategory", xref: "cluster§6.6.5.8.2",
                    details: "This field shall represent the sub-category or sub-genre of the program. Ex. Local."
                }
            ]
        },

        {
            tag: "datatype", name: "SeriesInfoStruct", xref: "cluster§6.6.5.9",
            details: "This object provides the episode information related to a program.",

            children: [
                {
                    tag: "field", name: "Season", xref: "cluster§6.6.5.9.1",
                    details: "This field shall represent the season of the series associated to the program."
                },
                {
                    tag: "field", name: "Episode", xref: "cluster§6.6.5.9.2",
                    details: "This field shall represent the episode of the program."
                }
            ]
        },

        {
            tag: "datatype", name: "ProgramCastStruct", xref: "cluster§6.6.5.10",
            details: "This object provides the cast information related to a program.",

            children: [
                {
                    tag: "field", name: "Name", xref: "cluster§6.6.5.10.1",
                    details: "This field shall represent the name of the cast member."
                },
                {
                    tag: "field", name: "Role", xref: "cluster§6.6.5.10.2",
                    details: "This field shall represent the role of the cast member. Ex. Actor, Director."
                }
            ]
        },

        {
            tag: "datatype", name: "PageTokenStruct", xref: "cluster§6.6.5.11",
            details: "This object defines the pagination structure.",

            children: [
                {
                    tag: "field", name: "Limit", xref: "cluster§6.6.5.11.1",
                    details: "This field shall indicate the maximum number of entries that should be retrieved from the program " +
                        "guide in a single response. It allows clients to specify the size of the paginated result set based " +
                        "on their needs."
                },

                {
                    tag: "field", name: "After", xref: "cluster§6.6.5.11.2",
                    details: "This field shall indicate the cursor that pinpoints the start of the upcoming data page. In a " +
                        "Cursor-based pagination system, the field acts as a reference point, ensuring the set of results " +
                        "corresponds directly to the data following the specified cursor. In a Offset-based pagination " +
                        "system, the field, along with limit, indicate the offset from which entries in the program guide " +
                        "will be retrieved."
                },

                {
                    tag: "field", name: "Before", xref: "cluster§6.6.5.11.3",
                    details: "This field shall indicate the cursor that pinpoints the end of the upcoming data page. In a " +
                        "Cursor-based pagination system, the field acts as a reference point, ensuring the set of results " +
                        "corresponds directly to the data preceding the specified cursor. In a Offset-based pagination " +
                        "system, the field, along with limit, indicate the offset from which entries in the program guide " +
                        "will be retrieved."
                }
            ]
        },

        {
            tag: "datatype", name: "ChannelPagingStruct", xref: "cluster§6.6.5.12",
            details: "This object defines the paging structure that includes the previous and next pagination tokens.",

            children: [
                {
                    tag: "field", name: "PreviousToken", xref: "cluster§6.6.5.12.1",
                    details: "This field shall indicate the token to retrieve the preceding page. Absence of this field denotes " +
                        "the response as the initial page."
                },
                {
                    tag: "field", name: "NextToken", xref: "cluster§6.6.5.12.2",
                    details: "This field shall indicate the token to retrieve the next page. Absence of this field denotes the " +
                        "response as the last page."
                }
            ]
        }
    ]
});
