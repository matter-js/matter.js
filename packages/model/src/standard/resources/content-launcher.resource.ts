/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add(
    {
        tag: "cluster", name: "ContentLauncher", classification: "application", pics: "CONTENTLAUNCHER",
        xref: "cluster§6.7",

        details: "This cluster provides an interface for launching content on a Video Player device such as a " +
            "Streaming Media Player, Smart TV or Smart Screen." +
            "\n" +
            "This cluster would be supported on a Video Player device or devices that can playback content, such " +
            "as a Streaming Media Player, Smart TV or Smart Screen. This cluster supports playing back content " +
            "referenced by URL. It supports finding content by type and global identifier, and either playing the " +
            "content or displaying the search results." +
            "\n" +
            "The cluster server for Content Launcher is implemented by an endpoint that can launch content, such " +
            "as a Video Player, or an endpoint representing a Content App on such a device." +
            "\n" +
            "When this cluster is implemented for an Content App Endpoint (Endpoint with type “Content App” and " +
            "having an Application Basic cluster), the Video Player device shall launch the application when a " +
            "client invokes the LaunchContent or LaunchURL commands.",

        children: [
            {
                tag: "attribute", name: "FeatureMap", xref: "cluster§6.7.4",

                children: [
                    { tag: "field", name: "CS", details: "Device supports content search (non-app specific)" },
                    { tag: "field", name: "UP", details: "Device supports basic URL-based file playback" },
                    {
                        tag: "field", name: "AS",
                        details: "Enables clients to implement more advanced media seeking behavior in their user interface, such as " +
                            "for example a \"seek bar\"."
                    },
                    { tag: "field", name: "TT", details: "Device or app supports Text Tracks." },
                    { tag: "field", name: "AT", details: "Device or app supports Audio Tracks." }
                ]
            },

            {
                tag: "attribute", name: "AcceptHeader", xref: "cluster§6.7.6.1",
                details: "This attribute shall provide a list of content types supported by the Video Player or Content App in " +
                    "the form of entries in the HTTP \"Accept\" request header."
            },
            {
                tag: "attribute", name: "SupportedStreamingProtocols", xref: "cluster§6.7.6.2",
                details: "This attribute shall provide information about supported streaming protocols."
            },

            {
                tag: "command", name: "LaunchContent", xref: "cluster§6.7.7.1",
                details: "Upon receipt, this shall launch the specified content with optional search criteria. This command " +
                    "returns a Launch Response.",

                children: [
                    {
                        tag: "field", name: "Search", xref: "cluster§6.7.7.1.1",
                        details: "This field shall indicate the content to launch."
                    },

                    {
                        tag: "field", name: "AutoPlay", xref: "cluster§6.7.7.1.2",
                        details: "This field shall indicate whether to automatically start playing content, where:" +
                            "\n" +
                            "  • TRUE means best match should start playing automatically." +
                            "\n" +
                            "  • FALSE means matches should be displayed on screen for user selection."
                    },

                    {
                        tag: "field", name: "Data", xref: "cluster§6.7.7.1.3",
                        details: "This field, if present, shall indicate app-specific data."
                    },

                    {
                        tag: "field", name: "PlaybackPreferences", xref: "cluster§6.7.7.1.4",

                        details: "This field, if present, shall indicate the user’s preferred Text/AudioTracks and playbackPosition " +
                            "for the media, sent from the client to the server. If the server does not find an available track " +
                            "for the title being played exactly matching a Track requested here, in the list of available tracks, " +
                            "it may default to picking another track that closely matches the requested track. Alternately, it " +
                            "may go with user preferences set on the server side (it will use this option if these " +
                            "PlaybackPreferences are not specified). In the case of text tracks, that may mean that the subtitle " +
                            "text is not displayed at all. In the cases where the preferred Text/AudioTracks are not available, " +
                            "the server shall return the TextTrackNotAvailable and/or AudioTrackNotAvailable Status(es) in the " +
                            "LauncherResponse."
                    },

                    {
                        tag: "field", name: "UseCurrentContext", xref: "cluster§6.7.7.1.5",

                        details: "This field, if present, shall indicate whether to consider the context of current ongoing activity " +
                            "on the receiver to fulfill the request. For example if the request only includes data in " +
                            "ContentSearch that specifies an Episode number, and UseCurrentContent is set to TRUE, if there is a " +
                            "TV series on going, the request refers to the specific episode of the ongoing season of the TV " +
                            "series. TRUE means current activity context may be considered FALSE means current activity context " +
                            "shall NOT be considered"
                    }
                ]
            },

            {
                tag: "command", name: "LaunchUrl", xref: "cluster§6.7.7.2",

                details: "Upon receipt, this shall launch content from the specified URL." +
                    "\n" +
                    "The content types supported include those identified in the AcceptHeader and " +
                    "SupportedStreamingProtocols attributes." +
                    "\n" +
                    "A check shall be made to ensure the URL is secure (uses HTTPS)." +
                    "\n" +
                    "When playing a video stream in response to this command, an indication (ex. visual) of the identity " +
                    "of the origin node of the video stream shall be provided. This could be in the form of a friendly " +
                    "name label which uniquely identifies the node to the user. This friendly name label is typically " +
                    "assigned by the Matter Admin (ex. TV) at the time of commissioning and, when it’s a device, is often " +
                    "editable by the user. It might be a combination of a company name and friendly name, for example, " +
                    "”Acme” or “Acme Streaming Service on Alice’s Phone”." +
                    "\n" +
                    "This command returns a Launch Response.",

                children: [
                    {
                        tag: "field", name: "ContentUrl", xref: "cluster§6.7.7.2.1",
                        details: "This field shall indicate the URL of content to launch. The syntax of this field shall follow the " +
                            "syntax as specified in RFC 1738 and shall use the https scheme."
                    },
                    {
                        tag: "field", name: "DisplayString", xref: "cluster§6.7.7.2.2",
                        details: "This field, if present, shall provide a string that may be used to describe the content being " +
                            "accessed at the given URL."
                    },
                    {
                        tag: "field", name: "BrandingInformation", xref: "cluster§6.7.7.2.3",
                        details: "This field, if present, shall indicate the branding information that may be displayed when playing " +
                            "back the given content."
                    },

                    {
                        tag: "field", name: "PlaybackPreferences", xref: "cluster§6.7.7.2.4",

                        details: "This field, if present, shall indicate the user’s preferred Text/AudioTracks and playbackPosition " +
                            "for the media, sent from the client to the server. If the server does not find an available track " +
                            "for the title being played exactly matching a Track requested here, in the list of available tracks, " +
                            "it may default to picking another track that closely matches the requested track. Alternately, it " +
                            "may go with user preferences set on the server side (it will use this option if these " +
                            "PlaybackPreferences are not specified). In the case of text tracks, that may mean that the subtitle " +
                            "text is not displayed at all. In the cases where the preferred Text/AudioTracks are not available, " +
                            "the server shall return the TextTrackNotAvailable and/or AudioTrackNotAvailable Status(es) in the " +
                            "LauncherResponse."
                    }
                ]
            },

            {
                tag: "command", name: "LauncherResponse", xref: "cluster§6.7.7.3",
                details: "This command shall be generated in response to LaunchContent and LaunchURL commands.",

                children: [
                    {
                        tag: "field", name: "Status", xref: "cluster§6.7.7.3.1",
                        details: "This field shall indicate the status of the command which resulted in this response."
                    },
                    {
                        tag: "field", name: "Data", xref: "cluster§6.7.7.3.2",
                        details: "This field shall indicate Optional app-specific data."
                    }
                ]
            },

            {
                tag: "datatype", name: "SupportedProtocolsBitmap", xref: "cluster§6.7.5.1",

                children: [
                    {
                        tag: "field", name: "Dash",
                        description: "Device supports Dynamic Adaptive Streaming over HTTP (DASH)"
                    },
                    { tag: "field", name: "Hls", description: "Device supports HTTP Live Streaming (HLS)" }
                ]
            },

            {
                tag: "datatype", name: "StatusEnum", xref: "cluster§6.7.5.2",

                children: [
                    { tag: "field", name: "Success", description: "Command succeeded" },
                    { tag: "field", name: "UrlNotAvailable", description: "Requested URL could not be reached by device." },
                    { tag: "field", name: "AuthFailed", description: "Requested URL returned 401 error code." },
                    {
                        tag: "field", name: "TextTrackNotAvailable",
                        description: "Requested Text Track (in PlaybackPreferences) not available"
                    },
                    {
                        tag: "field", name: "AudioTrackNotAvailable",
                        description: "Requested Audio Track (in PlaybackPreferences) not available"
                    }
                ]
            },

            {
                tag: "datatype", name: "ParameterEnum", xref: "cluster§6.7.5.3",

                children: [
                    {
                        tag: "field", name: "Actor",
                        description: "Actor represents an actor credited in video media content; for example, “Gaby Hoffman”"
                    },
                    {
                        tag: "field", name: "Channel",
                        description: "Channel represents the identifying data for a television channel; for example, \"PBS\""
                    },
                    {
                        tag: "field", name: "Character",
                        description: "A character represented in video media content; for example, “Snow White”"
                    },
                    {
                        tag: "field", name: "Director",
                        description: "A director of the video media content; for example, “Spike Lee”"
                    },
                    {
                        tag: "field", name: "Event",
                        description: "An event is a reference to a type of event; examples would include sports, music, or other types of events. For example, searching for \"Football games\" would search for a 'game' event entity and a 'football' sport entity."
                    },
                    {
                        tag: "field", name: "Franchise",
                        description: "A franchise is a video entity which can represent a number of video entities, like movies or TV shows. For example, take the fictional franchise \"Intergalactic Wars\" which represents a collection of movie trilogies, as well as animated and live action TV shows. This entity type was introduced to account for requests by customers such as \"Find Intergalactic Wars movies\", which would search for all 'Intergalactic Wars' programs of the MOVIE MediaType, rather than attempting to match to a single title."
                    },
                    {
                        tag: "field", name: "Genre",
                        description: "Genre represents the genre of video media content such as action, drama or comedy."
                    },
                    {
                        tag: "field", name: "League",
                        description: "League represents the categorical information for a sporting league; for example, \"NCAA\""
                    },
                    {
                        tag: "field", name: "Popularity",
                        description: "Popularity indicates whether the user asks for popular content."
                    },
                    {
                        tag: "field", name: "Provider",
                        description: "The provider (MSP) the user wants this media to be played on; for example, \"Netflix\"."
                    },
                    {
                        tag: "field", name: "Sport",
                        description: "Sport represents the categorical information of a sport; for example, football"
                    },
                    {
                        tag: "field", name: "SportsTeam",
                        description: "SportsTeam represents the categorical information of a professional sports team; for example, \"University of Washington Huskies\""
                    },
                    {
                        tag: "field", name: "Type",
                        description: "The type of content requested. Supported types are \"Movie\", \"MovieSeries\", \"TVSeries\", \"TVSeason\", \"TVEpisode\", \"Trailer\", \"SportsEvent\", \"LiveEvent\", and \"Video\""
                    },
                    {
                        tag: "field", name: "Video",
                        description: "Video represents the identifying data for a specific piece of video content; for example, \"Manchester by the Sea\"."
                    },
                    {
                        tag: "field", name: "Season",
                        description: "Season represents the specific season number within a TV series."
                    },
                    {
                        tag: "field", name: "Episode",
                        description: "Episode represents a specific episode number within a Season in a TV series."
                    },
                    {
                        tag: "field", name: "Any",
                        description: "Represents a search text input across many parameter types or even outside of the defined param types."
                    }
                ]
            },

            {
                tag: "datatype", name: "MetricTypeEnum", xref: "cluster§6.7.5.4",

                children: [
                    {
                        tag: "field", name: "Pixels", description: "Dimensions defined in a number of Pixels",
                        xref: "cluster§6.7.5.4.1",
                        details: "This value is used for dimensions defined in a number of Pixels."
                    },

                    {
                        tag: "field", name: "Percentage", description: "Dimensions defined as a percentage",
                        xref: "cluster§6.7.5.4.2",
                        details: "This value is for dimensions defined as a percentage of the overall display dimensions. For example, " +
                            "if using a Percentage Metric type for a Width measurement of 50.0, against a display width of 1920 " +
                            "pixels, then the resulting value used would be 960 pixels (50.0% of 1920) for that dimension. " +
                            "Whenever a measurement uses this Metric type, the resulting values shall be rounded (\"floored\") " +
                            "towards 0 if the measurement requires an integer final value."
                    }
                ]
            },

            {
                tag: "datatype", name: "AdditionalInfoStruct", xref: "cluster§6.7.5.5",
                details: "This object defines additional name=value pairs that can be used for identifying content.",

                children: [
                    {
                        tag: "field", name: "Name", xref: "cluster§6.7.5.5.1",
                        details: "This field shall indicate the name of external id, ex. \"musicbrainz\"."
                    },
                    {
                        tag: "field", name: "Value", xref: "cluster§6.7.5.5.2",
                        details: "This field shall indicate the value for external id, ex. \"ST0000000666661\"."
                    }
                ]
            },

            {
                tag: "datatype", name: "ParameterStruct", xref: "cluster§6.7.5.6",
                details: "This object defines inputs to a search for content for display or playback.",

                children: [
                    {
                        tag: "field", name: "Type", xref: "cluster§6.7.5.6.1",
                        details: "This field shall indicate the entity type."
                    },
                    {
                        tag: "field", name: "Value", xref: "cluster§6.7.5.6.2",
                        details: "This field shall indicate the entity value, which is a search string, ex. “Manchester by the Sea”."
                    },
                    {
                        tag: "field", name: "ExternalIdList", xref: "cluster§6.7.5.6.3",
                        details: "This field shall indicate the list of additional external content identifiers."
                    }
                ]
            },

            {
                tag: "datatype", name: "ContentSearchStruct", xref: "cluster§6.7.5.7",
                details: "This object defines inputs to a search for content for display or playback.",

                children: [{
                    tag: "field", name: "ParameterList", xref: "cluster§6.7.5.7.1",
                    details: "This field shall indicate the list of parameters comprising the search. If multiple parameters are " +
                        "provided, the search parameters shall be joined with 'AND' logic. e.g. action movies with Tom Cruise " +
                        "will be represented as [{Actor: 'Tom Cruise'}, {Type: 'Movie'}, {Genre: 'Action'}]"
                }]
            },

            {
                tag: "datatype", name: "DimensionStruct", xref: "cluster§6.7.5.8",
                details: "This object defines dimension which can be used for defining Size of background images.",

                children: [
                    {
                        tag: "field", name: "Width", xref: "cluster§6.7.5.8.1",
                        details: "This field shall indicate the width using the metric defined in Metric"
                    },
                    {
                        tag: "field", name: "Height", xref: "cluster§6.7.5.8.2",
                        details: "This field shall indicate the height using the metric defined in Metric"
                    },
                    {
                        tag: "field", name: "Metric", xref: "cluster§6.7.5.8.3",
                        details: "This field shall indicate metric used for defining Height/Width."
                    }
                ]
            },

            {
                tag: "datatype", name: "StyleInformationStruct", xref: "cluster§6.7.5.9",
                details: "This object defines style information which can be used by content providers to change the Media " +
                    "Player’s style related properties.",

                children: [
                    {
                        tag: "field", name: "ImageUrl", xref: "cluster§6.7.5.9.1",
                        details: "This field shall indicate the URL of image used for Styling different Video Player sections like " +
                            "Logo, Watermark etc. The syntax of this field shall follow the syntax as specified in RFC 1738 and " +
                            "shall use the https scheme."
                    },

                    {
                        tag: "field", name: "Color", xref: "cluster§6.7.5.9.2",

                        details: "This field shall indicate the color, in RGB or RGBA, used for styling different Video Player " +
                            "sections like Logo, Watermark, etc. The value shall conform to the 6-digit or 8-digit format defined " +
                            "for CSS sRGB hexadecimal color notation [https://www.w3.org/TR/css-color-4/#hex-notation]. Examples:" +
                            "\n" +
                            "  • #76DE19 for R=0x76, G=0xDE, B=0x19, A absent" +
                            "\n" +
                            "  • #76DE1980 for R=0x76, G=0xDE, B=0x19, A=0x80"
                    },

                    {
                        tag: "field", name: "Size", xref: "cluster§6.7.5.9.3",
                        details: "This field shall indicate the size of the image used for Styling different Video Player sections " +
                            "like Logo, Watermark etc."
                    }
                ]
            },

            {
                tag: "datatype", name: "BrandingInformationStruct", xref: "cluster§6.7.5.10",
                details: "This object defines Branding Information which can be provided by the client in order to customize " +
                    "the skin of the Video Player during playback.",

                children: [
                    {
                        tag: "field", name: "ProviderName", xref: "cluster§6.7.5.10.1",
                        details: "This field shall indicate name of the provider for the given content."
                    },

                    {
                        tag: "field", name: "Background", xref: "cluster§6.7.5.10.2",
                        details: "This field shall indicate background of the Video Player while content launch request is being " +
                            "processed by it. This background information may also be used by the Video Player when it is in idle " +
                            "state."
                    },

                    {
                        tag: "field", name: "Logo", xref: "cluster§6.7.5.10.3",
                        details: "This field shall indicate the logo shown when the Video Player is launching. This is also used when " +
                            "the Video Player is in the idle state and Splash field is not available."
                    },
                    {
                        tag: "field", name: "ProgressBar", xref: "cluster§6.7.5.10.4",
                        details: "This field shall indicate the style of progress bar for media playback."
                    },
                    {
                        tag: "field", name: "Splash", xref: "cluster§6.7.5.10.5",
                        details: "This field shall indicate the screen shown when the Video Player is in an idle state. If this " +
                            "property is not populated, the Video Player shall default to logo or the provider name."
                    },
                    {
                        tag: "field", name: "Watermark", xref: "cluster§6.7.5.10.6",
                        details: "This field shall indicate watermark shown when the media is playing."
                    }
                ]
            },

            {
                tag: "datatype", name: "PlaybackPreferencesStruct", xref: "cluster§6.7.5.11",
                details: "PlaybackPreferencesStruct defines the preferences sent by the client to the receiver in the " +
                    "ContentLauncher LaunchURL or LaunchContent commands.",

                children: [
                    {
                        tag: "field", name: "PlaybackPosition", xref: "cluster§6.7.5.11.1",

                        details: "This field shall indicate the preferred position (in milliseconds) in the media to launch playback " +
                            "from. In case the position falls in the middle of a frame, the server shall set the position to the " +
                            "beginning of that frame and set the SampledPosition attribute on the MediaPlayback cluster " +
                            "accordingly. A value of null shall indicate that playback position is not applicable for the current " +
                            "state of the media playback. (For example : Live media with no known duration and where seek is not " +
                            "supported)."
                    },

                    {
                        tag: "field", name: "TextTrack", xref: "cluster§6.7.5.11.2",
                        details: "This field shall indicate the user’s preferred Text Track. A value of null shall indicate that the " +
                            "user did not specify a preferred Text Track on the client. In such a case, the decision to display " +
                            "and select a Text Track is up to the server."
                    },

                    {
                        tag: "field", name: "AudioTracks", xref: "cluster§6.7.5.11.3",
                        details: "This field shall indicate the list of the user’s preferred Audio Tracks. If the list contains " +
                            "multiple values, each AudioTrack must also specify a unique audioOutputIndex to play the track on. A " +
                            "value of null shall indicate that the user did not specify a preferred Audio Track on the client. In " +
                            "such a case, the decision to play and select an Audio Track is up to the server."
                    }
                ]
            },

            {
                tag: "datatype", name: "TrackPreferenceStruct", xref: "cluster§6.7.5.12",
                details: "This structure defines Text/Audio Track preferences.",

                children: [
                    {
                        tag: "field", name: "LanguageCode", xref: "cluster§6.7.5.12.1",
                        details: "This field shall contain one of the standard Tags for Identifying Languages RFC 5646, which " +
                            "identifies the primary language used in the Track."
                    },

                    {
                        tag: "field", name: "Characteristics", xref: "cluster§6.7.5.12.2",
                        details: "This field shall contain a list of enumerated CharacteristicEnum values that indicate a purpose, " +
                            "trait or feature associated with the Track. A value of null shall indicate that there are no " +
                            "Characteristics corresponding to the Track."
                    },

                    {
                        tag: "field", name: "AudioOutputIndex", xref: "cluster§6.7.5.12.3",

                        details: "This field if present shall indicate the index of the OutputInfoStruct from the OutputList attribute " +
                            "(from the AudioOutput cluster) and indicates which audio output the Audio Track should be played on." +
                            "\n" +
                            "This field shall NOT be present if the track is not an audio track." +
                            "\n" +
                            "If the track is an audio track, this field MUST be present. A value of null shall indicate that the " +
                            "server can choose the audio output(s) to play the Audio Track on."
                    }
                ]
            }
        ]
    }
);
