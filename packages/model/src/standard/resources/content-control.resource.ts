/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Resource } from "#models/Resource.js";

Resource.add({
    tag: "cluster", name: "ContentControl", classification: "application", pics: "CONCON",
    xref: "cluster§6.13",

    details: "This cluster is used for managing the content control (including \"parental control\") settings on a " +
        "media device such as a TV, or Set-top Box." +
        "\n" +
        "This cluster allows to configure content control settings by clients with the Management privilege. " +
        "It is responsibility of the end product to enforce appropriate right access (for example, to prevent " +
        "a child from disabling this feature)." +
        "\n" +
        "NOTE Support for Content Control cluster is provisional.",

    children: [
        {
            tag: "attribute", name: "FeatureMap", xref: "cluster§6.13.4",

            children: [
                { tag: "field", name: "ST", details: "Supports managing screen time limits." },
                {
                    tag: "field", name: "PM",
                    details: "Supports managing a PIN code which is used for restricting access to configuration of this feature."
                },
                { tag: "field", name: "BU", details: "Supports managing content controls for unrated content." },
                {
                    tag: "field", name: "OCR",
                    details: "Supports managing content controls based upon rating threshold for on demand content."
                },
                {
                    tag: "field", name: "SCR",
                    details: "Supports managing content controls based upon rating threshold for scheduled content."
                },
                { tag: "field", name: "BC", details: "Supports managing a set of channels that are prohibited." },
                { tag: "field", name: "BA", details: "Supports managing a set of applications that are prohibited." },
                {
                    tag: "field", name: "BTW",
                    details: "Supports managing content controls based upon setting time window in which all contents and " +
                        "applications SHALL be blocked."
                }
            ]
        },

        {
            tag: "attribute", name: "Enabled", xref: "cluster§6.13.7.1",
            details: "Indicates whether the Content Control feature implemented on a media device is turned off (FALSE) or " +
                "turned on (TRUE)."
        },

        {
            tag: "attribute", name: "OnDemandRatings", xref: "cluster§6.13.7.2",

            details: "This attribute shall provide the collection of ratings that are currently valid for this media " +
                "device. The items should honor the metadata of the on-demand content (e.g. Movie) rating system for " +
                "one country or region where the media device has been provisioned. For example, for the MPAA system, " +
                "RatingName may be one value out of \"G\", \"PG\", \"PG-13\", \"R\", \"NC-17\"." +
                "\n" +
                "The media device shall have a way to determine which rating system applies for the on-demand content " +
                "and then populate this attribute. For example, it can do it through examining the Location attribute " +
                "in the Basic Information cluster, and then determining which rating system applies." +
                "\n" +
                "The ratings in this collection shall be in order from a rating for the youngest viewers to the one " +
                "for the oldest viewers. Each rating in the list shall be unique."
        },

        {
            tag: "attribute", name: "OnDemandRatingThreshold", xref: "cluster§6.13.7.3",

            details: "Indicates a threshold rating as a content filter which is compared with the rating for on-demand " +
                "content. For example, if the on-demand content rating is greater than or equal to " +
                "OnDemandRatingThreshold, for a rating system that is ordered from lower viewer age to higher viewer " +
                "age, then on-demand content is not appropriate for the User and the Node shall prevent the playback " +
                "of content." +
                "\n" +
                "This attribute shall be set to one of the values present in the OnDemandRatings attribute." +
                "\n" +
                "When this attribute changes, the device SHOULD make the user aware of any limits of this feature. " +
                "For example, if the feature does not control content within apps, then the device should make this " +
                "clear to the user when the attribute changes."
        },

        {
            tag: "attribute", name: "ScheduledContentRatings", xref: "cluster§6.13.7.4",

            details: "Indicates a collection of ratings which ScheduledContentRatingThreshold can be set to. The items " +
                "should honor metadata of the scheduled content rating system for the country or region where the " +
                "media device has been provisioned." +
                "\n" +
                "The media device shall have a way to determine which scheduled content rating system applies and " +
                "then populate this attribute. For example, this can be done by examining the Location attribute in " +
                "Basic Information cluster, and then determining which rating system applies." +
                "\n" +
                "The ratings in this collection shall be in order from a rating for the youngest viewers to the one " +
                "for the oldest viewers. Each rating in the list shall be unique."
        },

        {
            tag: "attribute", name: "ScheduledContentRatingThreshold", xref: "cluster§6.13.7.5",

            details: "Indicates a threshold rating as a content filter which is used to compare with the rating for " +
                "scheduled content. For example, if the scheduled content rating is greater than or equal to " +
                "ScheduledContentRatingThreshold for a rating system that is ordered from lower viewer age to higher " +
                "viewer age, then the scheduled content is not appropriate for the User and shall be blocked." +
                "\n" +
                "This attribute shall be set to one of the values present in the ScheduledContentRatings attribute." +
                "\n" +
                "When this attribute changes, the device SHOULD make the user aware of any limits of this feature. " +
                "For example, if the feature does not control content within apps, then the device should make this " +
                "clear to the user when the attribute changes."
        },

        {
            tag: "attribute", name: "ScreenDailyTime", xref: "cluster§6.13.7.6",
            details: "Indicates the amount of time (in seconds) which the User is allowed to spend watching TV within one " +
                "day when the Content Control feature is activated."
        },

        {
            tag: "attribute", name: "RemainingScreenTime", xref: "cluster§6.13.7.7",

            details: "Indicates the remaining screen time (in seconds) which the User is allowed to spend watching TV for " +
                "the current day when the Content Control feature is activated. When this value equals 0, the media " +
                "device shall terminate the playback of content." +
                "\n" +
                "This attribute shall be updated when the AddBonusTime command is received and processed successfully " +
                "(with the correct PIN)."
        },

        {
            tag: "attribute", name: "BlockUnrated", xref: "cluster§6.13.7.8",

            details: "Indicates whether the playback of unrated content is allowed when the Content Control feature is " +
                "activated. If this attribute equals FALSE, then playback of unrated content shall be permitted. " +
                "Otherwise, the media device shall prevent the playback of unrated content." +
                "\n" +
                "When this attribute changes, the device SHOULD make the user aware of any limits of this feature. " +
                "For example, if the feature does not control content within apps, then the device should make this " +
                "clear to the user when the attribute changes."
        },

        {
            tag: "attribute", name: "BlockChannelList", xref: "cluster§6.13.7.9",
            details: "Indicates a set of channels that shall be blocked when the Content Control feature is activated."
        },
        {
            tag: "attribute", name: "BlockApplicationList", xref: "cluster§6.13.7.10",
            details: "Indicates a set of applications that shall be blocked when the Content Control feature is activated."
        },

        {
            tag: "attribute", name: "BlockContentTimeWindow", xref: "cluster§6.13.7.11",

            details: "Indicates a set of periods during which the playback of content on media device shall be blocked " +
                "when the Content Control feature is activated. The media device shall reject any request to play " +
                "content during one period of this attribute. If it is entering any one period of this attribute, the " +
                "media device shall block content which is playing and generate an event " +
                "EnteringBlockContentTimeWindow. There shall NOT be multiple entries in this attribute list for the " +
                "same day of week."
        },

        {
            tag: "event", name: "RemainingScreenTimeExpired", xref: "cluster§6.13.9.1",
            details: "This event shall be generated when the RemainingScreenTime equals 0."
        },
        {
            tag: "event", name: "EnteringBlockContentTimeWindow", xref: "cluster§6.13.9.2",
            details: "This event shall be generated when entering a period of blocked content as configured in the " +
                "BlockContentTimeWindow attribute."
        },

        {
            tag: "command", name: "UpdatePin", xref: "cluster§6.13.8.1",

            details: "The purpose of this command is to update the PIN used for protecting configuration of the content " +
                "control settings. Upon success, the old PIN shall no longer work." +
                "\n" +
                "The PIN is used to ensure that only the Node (or User) with the PIN code can make changes to the " +
                "Content Control settings, for example, turn off Content Controls or modify the ScreenDailyTime. The " +
                "PIN is composed of a numeric string of up to 6 human readable characters (displayable) ." +
                "\n" +
                "Upon receipt of this command, the media device shall check if the OldPIN field of this command is " +
                "the same as the current PIN. If the PINs are the same, then the PIN code shall be set to NewPIN. " +
                "Otherwise a response with InvalidPINCode error status shall be returned." +
                "\n" +
                "The media device may provide a default PIN to the User via an out of band mechanism. For security " +
                "reasons, it is recommended that a client encourage the user to update the PIN from its default value " +
                "when performing configuration of the Content Control settings exposed by this cluster. The ResetPIN " +
                "command can also be used to obtain the default PIN.",

            children: [
                {
                    tag: "field", name: "OldPin", xref: "cluster§6.13.8.1.1",
                    details: "This field shall specify the original PIN. Once the UpdatePIN command is performed successfully, it " +
                        "shall be invalid."
                },
                {
                    tag: "field", name: "NewPin", xref: "cluster§6.13.8.1.2",
                    details: "This field shall indicate a new PIN for the Content Control feature."
                }
            ]
        },

        {
            tag: "command", name: "ResetPin", xref: "cluster§6.13.8.2",
            details: "The purpose of this command is to reset the PIN." +
                "\n" +
                "If this command is executed successfully, a ResetPINResponse command with a new PIN shall be " +
                "returned."
        },

        {
            tag: "command", name: "ResetPinResponse", xref: "cluster§6.13.8.3",
            details: "This command shall be generated in response to a ResetPIN command.",
            children: [{
                tag: "field", name: "PinCode", xref: "cluster§6.13.8.3.1",
                details: "This field shall indicate a new PIN of the Content Control feature."
            }]
        },

        {
            tag: "command", name: "Enable", xref: "cluster§6.13.8.4",
            details: "The purpose of this command is to turn on the Content Control feature on a media device." +
                "\n" +
                "Upon receipt of the Enable command, the media device shall set the Enabled attribute to TRUE."
        },

        {
            tag: "command", name: "Disable", xref: "cluster§6.13.8.5",
            details: "The purpose of this command is to turn off the Content Control feature on a media device." +
                "\n" +
                "On receipt of the Disable command, the media device shall set the Enabled attribute to FALSE."
        },

        {
            tag: "command", name: "AddBonusTime", xref: "cluster§6.13.8.6",

            details: "The purpose of this command is to add the extra screen time for the user." +
                "\n" +
                "If a client with Operate privilege invokes this command, the media device shall check whether the " +
                "PINCode passed in the command matches the current PINCode value. If these match, then the " +
                "RemainingScreenTime attribute shall be increased by the specified BonusTime value." +
                "\n" +
                "If the PINs do not match, then a response with InvalidPINCode error status shall be returned, and no " +
                "changes shall be made to RemainingScreenTime." +
                "\n" +
                "If a client with Manage privilege or greater invokes this command, the media device shall ignore the " +
                "PINCode field and directly increase the RemainingScreenTime attribute by the specified BonusTime " +
                "value." +
                "\n" +
                "A server that does not support the PM feature shall respond with InvalidPINCode to clients that only " +
                "have Operate privilege unless:" +
                "\n" +
                "  • It has been provided with the PIN value to expect via an out of band mechanism, and" +
                "\n" +
                "  • The client has provided a PINCode that matches the expected PIN value.",

            children: [
                {
                    tag: "field", name: "PinCode", xref: "cluster§6.13.8.6.1",

                    details: "This field shall indicate the PIN." +
                        "\n" +
                        "This field shall be optional for clients with Manage or greater privilege but shall be mandatory for " +
                        "clients with Operate privilege. The PIN provided in this field shall be used to guarantee that a " +
                        "client with Operate permission is allowed to invoke this command only if the PIN passed in this " +
                        "command is equal to the current PIN value."
                },

                {
                    tag: "field", name: "BonusTime", xref: "cluster§6.13.8.6.2",
                    details: "This field shall indicate the amount of extra time (in seconds) to increase RemainingScreenTime. " +
                        "This field shall NOT exceed the remaining time of this day."
                }
            ]
        },

        {
            tag: "command", name: "SetScreenDailyTime", xref: "cluster§6.13.8.7",
            details: "The purpose of this command is to set the ScreenDailyTime attribute." +
                "\n" +
                "Upon receipt of the SetScreenDailyTime command, the media device shall set the ScreenDailyTime " +
                "attribute to the ScreenTime value.",
            children: [{
                tag: "field", name: "ScreenTime", xref: "cluster§6.13.8.7.1",
                details: "This field shall indicate the time (in seconds) which the User is allowed to spend watching TV on " +
                    "this media device within one day."
            }]
        },

        {
            tag: "command", name: "BlockUnratedContent", xref: "cluster§6.13.8.8",
            details: "The purpose of this command is to specify whether programs with no Content rating must be blocked by " +
                "this media device." +
                "\n" +
                "Upon receipt of the BlockUnratedContent command, the media device shall set the BlockUnrated " +
                "attribute to TRUE."
        },

        {
            tag: "command", name: "UnblockUnratedContent", xref: "cluster§6.13.8.9",
            details: "The purpose of this command is to specify whether programs with no Content rating must be blocked by " +
                "this media device." +
                "\n" +
                "Upon receipt of the UnblockUnratedContent command, the media device shall set the BlockUn rated " +
                "attribute to FALSE."
        },

        {
            tag: "command", name: "SetOnDemandRatingThreshold", xref: "cluster§6.13.8.10",
            details: "The purpose of this command is to set the OnDemandRatingThreshold attribute." +
                "\n" +
                "Upon receipt of the SetOnDemandRatingThreshold command, the media device shall check if the Rating " +
                "field is one of values present in the OnDemandRatings attribute. If not, then a response with " +
                "InvalidRating error status shall be returned.",
            children: [{
                tag: "field", name: "Rating", xref: "cluster§6.13.8.10.1",
                details: "This field indicates a threshold rating for filtering on-demand content. This field shall be set to " +
                    "one of the values present in the OnDemandRatings attribute"
            }]
        },

        {
            tag: "command", name: "SetScheduledContentRatingThreshold", xref: "cluster§6.13.8.11",
            details: "The purpose of this command is to set ScheduledContentRatingThreshold attribute." +
                "\n" +
                "Upon receipt of the SetScheduledContentRatingThreshold command, the media device shall check if the " +
                "Rating field is one of values present in the ScheduledContentRatings attribute. If not, then a " +
                "response with InvalidRating error status shall be returned.",
            children: [{
                tag: "field", name: "Rating", xref: "cluster§6.13.8.11.1",
                details: "This field indicates a threshold rating for filtering scheduled content. This field shall be set to " +
                    "one of the values present in the ScheduledContentRatings attribute."
            }]
        },

        {
            tag: "command", name: "AddBlockChannels", xref: "cluster§6.13.8.12",

            details: "The purpose of this command is to set BlockChannelList attribute." +
                "\n" +
                "Upon receipt of the AddBlockChannels command, the media device shall check if the channels passed in " +
                "this command are valid. If the channel is invalid, then a response with InvalidChannel error Status " +
                "shall be returned." +
                "\n" +
                "If there is at least one channel in Channels field which is not in the BlockChannelList attribute, " +
                "the media device shall process the request by adding these new channels into the BlockChannelList " +
                "attribute and return a successful Status Response. During this process, the media device shall " +
                "assign one unique index to BlockChannelIndex field for every channel passed in this command." +
                "\n" +
                "If all channels in Channel field already exist in the BlockChannelList attribute, then a response " +
                "with ChannelAlreadyExist error Status shall be returned.",

            children: [{
                tag: "field", name: "Channels", xref: "cluster§6.13.8.12.1",
                details: "This field indicates a set of channels that shall be blocked when the Content Control feature is " +
                    "activated. This field shall be set to values present in ChannelList attribute in the Channel " +
                    "cluster. The BlockChannelIndex field passed in this command shall be NULL."
            }]
        },

        {
            tag: "command", name: "RemoveBlockChannels", xref: "cluster§6.13.8.13",

            details: "The purpose of this command is to remove channels from the BlockChannelList attribute." +
                "\n" +
                "Upon receipt of the RemoveBlockChannels command, the media device shall check if the channels " +
                "indicated by ChannelIndexes passed in this command are present in BlockChannelList attribute. If one " +
                "or more channels indicated by ChannelIndexes passed in this command field are not present in the " +
                "BlockChannelList attribute, then a response with ChannelNotExist error Status shall be returned.",

            children: [{
                tag: "field", name: "ChannelIndexes", xref: "cluster§6.13.8.13.1",
                details: "This field shall specify a set of indexes indicating Which channels shall be removed from the " +
                    "BlockChannelList attribute."
            }]
        },

        {
            tag: "command", name: "AddBlockApplications", xref: "cluster§6.13.8.14",

            details: "The purpose of this command is to set applications to the BlockApplicationList attribute." +
                "\n" +
                "Upon receipt of the AddBlockApplications command, the media device shall check if the Applications " +
                "passed in this command are installed. If there is an application in Applications field which is not " +
                "identified by media device, then a response with UnidentifiableApplication error Status may be " +
                "returned." +
                "\n" +
                "If there is one or more applications which are not present in BlockApplicationList attribute, the " +
                "media device shall process the request by adding the new application to the BlockApplicationList " +
                "attribute and return a successful Status Response." +
                "\n" +
                "If all applications in Applications field are already present in BlockApplicationList attribute, " +
                "then a response with ApplicationAlreadyExist error Status shall be returned.",

            children: [{
                tag: "field", name: "Applications", xref: "cluster§6.13.8.14.1",
                details: "This field indicates a set of applications that shall be blocked when the Content Control feature is " +
                    "activated."
            }]
        },

        {
            tag: "command", name: "RemoveBlockApplications", xref: "cluster§6.13.8.15",

            details: "The purpose of this command is to remove applications from the BlockApplicationList attribute." +
                "\n" +
                "Upon receipt of the RemoveBlockApplications command, the media device shall check if the " +
                "applications passed in this command present in the BlockApplicationList attribute. If one or more " +
                "applications in Applications field which are not present in the BlockApplicationList attribute, then " +
                "a response with ApplicationNotExist error Status shall be returned.",

            children: [{
                tag: "field", name: "Applications", xref: "cluster§6.13.8.15.1",
                details: "This field indicates a set of applications which shall be removed from BlockApplicationList " +
                    "attribute."
            }]
        },

        {
            tag: "command", name: "SetBlockContentTimeWindow", xref: "cluster§6.13.8.16",

            details: "The purpose of this command is to set the BlockContentTimeWindow attribute." +
                "\n" +
                "Upon receipt of the SetBlockContentTimeWindow command, the media device shall check if the " +
                "TimeWindowIndex field passed in this command is NULL. If the TimeWindowIndex field is NULL, the " +
                "media device shall check if there is an entry in the BlockContentTimeWindow attribute which matches " +
                "with the TimePeriod and DayOfWeek fields passed in this command. * If Yes, then a response with " +
                "TimeWindowAlreadyExist error status shall be returned. * If No, then the media device shall assign " +
                "one unique index for this time window and add it into the BlockContentTimeWindow list attribute." +
                "\n" +
                "If the TimeWindowIndex field is not NULL and presents in the BlockContentTimeWindow attribute, the " +
                "media device shall replace the original time window with the new time window passed in this command.",

            children: [{
                tag: "field", name: "TimeWindow", xref: "cluster§6.13.8.16.1",
                details: "This field shall indicate a time window requested to set to the BlockContentTimeWindow attribute."
            }]
        },

        {
            tag: "command", name: "RemoveBlockContentTimeWindow", xref: "cluster§6.13.8.17",

            details: "The purpose of this command is to remove the selected time windows from the BlockContentTimeWindow " +
                "attribute." +
                "\n" +
                "Upon receipt of the RemoveBlockContentTimeWindow command, the media device shall check if the time " +
                "window index passed in this command presents in the BlockContentTimeWindow attribute." +
                "\n" +
                "If one or more time window indexes passed in this command are not present in BlockContentTimeWindow " +
                "attribute, then a response with TimeWindowNotExist error status shall be returned.",

            children: [{
                tag: "field", name: "TimeWindowIndexes", xref: "cluster§6.13.8.17.1",
                details: "This field shall specify a set of time window indexes indicating which time windows will be removed " +
                    "from the BlockContentTimeWindow attribute."
            }]
        },

        {
            tag: "datatype", name: "DayOfWeekBitmap", xref: "cluster§6.13.5.1",

            children: [
                { tag: "field", name: "Sunday", description: "Sunday" },
                { tag: "field", name: "Monday", description: "Monday" },
                { tag: "field", name: "Tuesday", description: "Tuesday" },
                { tag: "field", name: "Wednesday", description: "Wednesday" },
                { tag: "field", name: "Thursday", description: "Thursday" },
                { tag: "field", name: "Friday", description: "Friday" },
                { tag: "field", name: "Saturday", description: "Saturday" }
            ]
        },

        {
            tag: "datatype", name: "RatingNameStruct", xref: "cluster§6.13.5.2",

            children: [
                {
                    tag: "field", name: "RatingName", xref: "cluster§6.13.5.2.1",
                    details: "This field shall indicate the name of the rating level of the applied rating system. The applied " +
                        "rating system is dependent upon the region or country where the Node has been provisioned, and may " +
                        "vary from one country to another."
                },

                {
                    tag: "field", name: "RatingNameDesc", xref: "cluster§6.13.5.2.2",
                    details: "This field shall specify a human readable (displayable) description for RatingName."
                }
            ]
        },

        {
            tag: "datatype", name: "BlockChannelStruct", xref: "cluster§6.13.5.3",

            children: [
                {
                    tag: "field", name: "BlockChannelIndex", xref: "cluster§6.13.5.3.1",
                    details: "This field shall indicate a unique index value for a blocked channel. This value may be used to " +
                        "indicate one selected channel which will be removed from BlockChannelList attribute."
                },

                {
                    tag: "field", name: "MajorNumber", xref: "cluster§6.13.5.3.2",
                    details: "This field shall indicate the channel major number value (for example, using ATSC format). When the " +
                        "channel number is expressed as a string, such as \"13.1\" or \"256\", the major number would be 13 or " +
                        "256, respectively. This field is required but shall be set to 0 for channels such as over-the-top " +
                        "channels that are not represented by a major or minor number."
                },

                {
                    tag: "field", name: "MinorNumber", xref: "cluster§6.13.5.3.3",
                    details: "This field shall indicate the channel minor number value (for example, using ATSC format). When the " +
                        "channel number is expressed as a string, such as \"13.1\" or \"256\", the minor number would be 1 or 0, " +
                        "respectively. This field is required but shall be set to 0 for channels such as over-the-top " +
                        "channels that are not represented by a major or minor number."
                },

                {
                    tag: "field", name: "Identifier", xref: "cluster§6.13.5.3.4",
                    details: "This field shall indicate the unique identifier for a specific channel. This field is optional, but " +
                        "SHOULD be provided when MajorNumber and MinorNumber are not available."
                }
            ]
        },

        {
            tag: "datatype", name: "AppInfoStruct", xref: "cluster§6.13.5.4",

            children: [
                {
                    tag: "field", name: "CatalogVendorId", xref: "cluster§6.13.5.4.1",
                    details: "This field shall indicate the Connectivity Standards Alliance-issued vendor ID for the catalog. The " +
                        "DIAL registry shall use value 0x0000." +
                        "\n" +
                        "Content App Platform providers will have their own catalog vendor ID (set to their own Vendor ID) " +
                        "and will assign an ApplicationID to each Content App."
                },

                {
                    tag: "field", name: "ApplicationId", xref: "cluster§6.13.5.4.2",
                    details: "This field shall indicate the application identifier, expressed as a string, such as \"PruneVideo\" or " +
                        "\"Company X\". This field shall be unique within a catalog."
                }
            ]
        },

        {
            tag: "datatype", name: "TimeWindowStruct", xref: "cluster§6.13.5.5",

            children: [
                {
                    tag: "field", name: "TimeWindowIndex", xref: "cluster§6.13.5.5.1",
                    details: "This field shall indicate a unique index of a specific time window. This value may be used to " +
                        "indicate a selected time window which will be removed from the BlockContentTimeWindow attribute."
                },
                {
                    tag: "field", name: "DayOfWeek", xref: "cluster§6.13.5.5.2",
                    details: "This field shall indicate a day of week."
                },
                {
                    tag: "field", name: "TimePeriod", xref: "cluster§6.13.5.5.3",
                    details: "This field shall indicate one or more discrete time periods."
                }
            ]
        },

        {
            tag: "datatype", name: "TimePeriodStruct", xref: "cluster§6.13.5.6",

            children: [
                {
                    tag: "field", name: "StartHour", xref: "cluster§6.13.5.6.1",
                    details: "This field shall indicate the starting hour."
                },
                {
                    tag: "field", name: "StartMinute", xref: "cluster§6.13.5.6.2",
                    details: "This field shall indicate the starting minute."
                },
                {
                    tag: "field", name: "EndHour", xref: "cluster§6.13.5.6.3",
                    details: "This field shall indicate the ending hour. EndHour shall be equal to or greater than StartHour"
                },

                {
                    tag: "field", name: "EndMinute", xref: "cluster§6.13.5.6.4",
                    details: "This field shall indicate the ending minute. If EndHour is equal to StartHour then EndMinute shall " +
                        "be greater than StartMinute. If the EndHour is equal to 23 and the EndMinute is equal to 59, all " +
                        "contents shall be blocked until 23:59:59."
                }
            ]
        },

        {
            tag: "datatype", name: "StatusCodeEnum", xref: "cluster§6.13.6.1",

            children: [
                {
                    tag: "field", name: "InvalidPinCode",
                    description: "Provided PIN Code does not match the current PIN code."
                },
                {
                    tag: "field", name: "InvalidRating",
                    description: "Provided Rating is out of scope of the corresponding Rating list."
                },
                { tag: "field", name: "InvalidChannel", description: "Provided Channel(s) is invalid." },
                { tag: "field", name: "ChannelAlreadyExist", description: "Provided Channel(s) already exists." },
                {
                    tag: "field", name: "ChannelNotExist",
                    description: "Provided Channel(s) doesn’t exist in BlockChannelList attribute."
                },
                {
                    tag: "field", name: "UnidentifiableApplication",
                    description: "Provided Application(s) is not identified."
                },
                {
                    tag: "field", name: "ApplicationAlreadyExist",
                    description: "Provided Application(s) already exists."
                },
                {
                    tag: "field", name: "ApplicationNotExist",
                    description: "Provided Application(s) doesn’t exist in BlockApplicationList attribute."
                },
                {
                    tag: "field", name: "TimeWindowAlreadyExist",
                    description: "Provided time Window already exists in BlockContentTimeWindow attribute."
                },
                {
                    tag: "field", name: "TimeWindowNotExist",
                    description: "Provided time window doesn’t exist in BlockContentTimeWindow attribute."
                }
            ]
        }
    ]
});
