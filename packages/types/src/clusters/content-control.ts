/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { StatusResponseError } from "../common/StatusResponseError.js";
import { Status } from "../globals/Status.js";
import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { ContentControl as ContentControlModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the ContentControl cluster.
 */
export namespace ContentControl {
    /**
     * {@link ContentControl} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates whether the Content Control feature implemented on a media device is turned off (FALSE) or
             * turned on (TRUE).
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.1
             */
            readonly enabled: boolean;
        }

        export interface Commands {
            /**
             * The purpose of this command is to turn on the Content Control feature on a media device.
             *
             * Upon receipt of the Enable command, the media device shall set the Enabled attribute to TRUE.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.4
             */
            enable(): MaybePromise;

            /**
             * The purpose of this command is to turn off the Content Control feature on a media device.
             *
             * On receipt of the Disable command, the media device shall set the Enabled attribute to FALSE.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.5
             */
            disable(): MaybePromise;
        }
    }

    /**
     * {@link ContentControl} supports these elements if it supports feature "OnDemandContentRating".
     */
    export namespace OnDemandContentRatingComponent {
        export interface Attributes {
            /**
             * This attribute shall provide the collection of ratings that are currently valid for this media device.
             * The items should honor the metadata of the on-demand content (e.g. Movie) rating system for one country
             * or region where the media device has been provisioned. For example, for the MPAA system, RatingName may
             * be one value out of "G", "PG", "PG-13", "R", "NC-17".
             *
             * The media device shall have a way to determine which rating system applies for the on-demand content and
             * then populate this attribute. For example, it can do it through examining the Location attribute in the
             * Basic Information cluster, and then determining which rating system applies.
             *
             * The ratings in this collection shall be in order from a rating for the youngest viewers to the one for
             * the oldest viewers. Each rating in the list shall be unique.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.2
             */
            readonly onDemandRatings: RatingName[];

            /**
             * Indicates a threshold rating as a content filter which is compared with the rating for on-demand content.
             * For example, if the on-demand content rating is greater than or equal to OnDemandRatingThreshold, for a
             * rating system that is ordered from lower viewer age to higher viewer age, then on-demand content is not
             * appropriate for the User and the Node shall prevent the playback of content.
             *
             * This attribute shall be set to one of the values present in the OnDemandRatings attribute.
             *
             * When this attribute changes, the device SHOULD make the user aware of any limits of this feature. For
             * example, if the feature does not control content within apps, then the device should make this clear to
             * the user when the attribute changes.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.3
             */
            readonly onDemandRatingThreshold: string;
        }

        export interface Commands {
            /**
             * The purpose of this command is to set the OnDemandRatingThreshold attribute.
             *
             * Upon receipt of the SetOnDemandRatingThreshold command, the media device shall check if the Rating field
             * is one of values present in the OnDemandRatings attribute. If not, then a response with InvalidRating
             * error status shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.10
             */
            setOnDemandRatingThreshold(request: SetOnDemandRatingThresholdRequest): MaybePromise;
        }
    }

    /**
     * {@link ContentControl} supports these elements if it supports feature "ScheduledContentRating".
     */
    export namespace ScheduledContentRatingComponent {
        export interface Attributes {
            /**
             * Indicates a collection of ratings which ScheduledContentRatingThreshold can be set to. The items should
             * honor metadata of the scheduled content rating system for the country or region where the media device
             * has been provisioned.
             *
             * The media device shall have a way to determine which scheduled content rating system applies and then
             * populate this attribute. For example, this can be done by examining the Location attribute in Basic
             * Information cluster, and then determining which rating system applies.
             *
             * The ratings in this collection shall be in order from a rating for the youngest viewers to the one for
             * the oldest viewers. Each rating in the list shall be unique.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.4
             */
            readonly scheduledContentRatings: RatingName[];

            /**
             * Indicates a threshold rating as a content filter which is used to compare with the rating for scheduled
             * content. For example, if the scheduled content rating is greater than or equal to
             * ScheduledContentRatingThreshold for a rating system that is ordered from lower viewer age to higher
             * viewer age, then the scheduled content is not appropriate for the User and shall be blocked.
             *
             * This attribute shall be set to one of the values present in the ScheduledContentRatings attribute.
             *
             * When this attribute changes, the device SHOULD make the user aware of any limits of this feature. For
             * example, if the feature does not control content within apps, then the device should make this clear to
             * the user when the attribute changes.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.5
             */
            readonly scheduledContentRatingThreshold: string;
        }

        export interface Commands {
            /**
             * The purpose of this command is to set ScheduledContentRatingThreshold attribute.
             *
             * Upon receipt of the SetScheduledContentRatingThreshold command, the media device shall check if the
             * Rating field is one of values present in the ScheduledContentRatings attribute. If not, then a response
             * with InvalidRating error status shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.11
             */
            setScheduledContentRatingThreshold(request: SetScheduledContentRatingThresholdRequest): MaybePromise;
        }
    }

    /**
     * {@link ContentControl} supports these elements if it supports feature "ScreenTime".
     */
    export namespace ScreenTimeComponent {
        export interface Attributes {
            /**
             * Indicates the amount of time (in seconds) which the User is allowed to spend watching TV within one day
             * when the Content Control feature is activated.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.6
             */
            readonly screenDailyTime: number;

            /**
             * Indicates the remaining screen time (in seconds) which the User is allowed to spend watching TV for the
             * current day when the Content Control feature is activated. When this value equals 0, the media device
             * shall terminate the playback of content.
             *
             * This attribute shall be updated when the AddBonusTime command is received and processed successfully
             * (with the correct PIN).
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.7
             */
            readonly remainingScreenTime: number;
        }

        export interface Commands {
            /**
             * The purpose of this command is to add the extra screen time for the user.
             *
             * If a client with Operate privilege invokes this command, the media device shall check whether the PINCode
             * passed in the command matches the current PINCode value. If these match, then the RemainingScreenTime
             * attribute shall be increased by the specified BonusTime value.
             *
             * If the PINs do not match, then a response with InvalidPINCode error status shall be returned, and no
             * changes shall be made to RemainingScreenTime.
             *
             * If a client with Manage privilege or greater invokes this command, the media device shall ignore the
             * PINCode field and directly increase the RemainingScreenTime attribute by the specified BonusTime value.
             *
             * A server that does not support the PM feature shall respond with InvalidPINCode to clients that only have
             * Operate privilege unless:
             *
             *   - It has been provided with the PIN value to expect via an out of band mechanism, and
             *
             *   - The client has provided a PINCode that matches the expected PIN value.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.6
             */
            addBonusTime(request: AddBonusTimeRequest): MaybePromise;

            /**
             * The purpose of this command is to set the ScreenDailyTime attribute.
             *
             * Upon receipt of the SetScreenDailyTime command, the media device shall set the ScreenDailyTime attribute
             * to the ScreenTime value.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.7
             */
            setScreenDailyTime(request: SetScreenDailyTimeRequest): MaybePromise;
        }

        export interface Events {
            /**
             * This event shall be generated when the RemainingScreenTime equals 0.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.9.1
             */
            remainingScreenTimeExpired: void;
        }
    }

    /**
     * {@link ContentControl} supports these elements if it supports feature "BlockUnrated".
     */
    export namespace BlockUnratedComponent {
        export interface Attributes {
            /**
             * Indicates whether the playback of unrated content is allowed when the Content Control feature is
             * activated. If this attribute equals FALSE, then playback of unrated content shall be permitted.
             * Otherwise, the media device shall prevent the playback of unrated content.
             *
             * When this attribute changes, the device SHOULD make the user aware of any limits of this feature. For
             * example, if the feature does not control content within apps, then the device should make this clear to
             * the user when the attribute changes.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.8
             */
            readonly blockUnrated: boolean;
        }

        export interface Commands {
            /**
             * The purpose of this command is to specify whether programs with no Content rating must be blocked by this
             * media device.
             *
             * Upon receipt of the BlockUnratedContent command, the media device shall set the BlockUnrated attribute to
             * TRUE.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.8
             */
            blockUnratedContent(): MaybePromise;

            /**
             * The purpose of this command is to specify whether programs with no Content rating must be blocked by this
             * media device.
             *
             * Upon receipt of the UnblockUnratedContent command, the media device shall set the BlockUnrated attribute
             * to FALSE.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.9
             */
            unblockUnratedContent(): MaybePromise;
        }
    }

    /**
     * {@link ContentControl} supports these elements if it supports feature "BlockChannels".
     */
    export namespace BlockChannelsComponent {
        export interface Attributes {
            /**
             * Indicates a set of channels that shall be blocked when the Content Control feature is activated.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.9
             */
            readonly blockChannelList: BlockChannel[];
        }

        export interface Commands {
            /**
             * The purpose of this command is to set BlockChannelList attribute.
             *
             * Upon receipt of the AddBlockChannels command, the media device shall check if the channels passed in this
             * command are valid. If the channel is invalid, then a response with InvalidChannel error Status shall be
             * returned.
             *
             * If there is at least one channel in Channels field which is not in the BlockChannelList attribute, the
             * media device shall process the request by adding these new channels into the BlockChannelList attribute
             * and return a successful Status Response. During this process, the media device shall assign one unique
             * index to BlockChannelIndex field for every channel passed in this command.
             *
             * If all channels in Channel field already exist in the BlockChannelList attribute, then a response with
             * ChannelAlreadyExist error Status shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.12
             */
            addBlockChannels(request: AddBlockChannelsRequest): MaybePromise;

            /**
             * The purpose of this command is to remove channels from the BlockChannelList attribute.
             *
             * Upon receipt of the RemoveBlockChannels command, the media device shall check if the channels indicated
             * by ChannelIndexes passed in this command are present in BlockChannelList attribute. If one or more
             * channels indicated by ChannelIndexes passed in this command field are not present in the BlockChannelList
             * attribute, then a response with ChannelNotExist error Status shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.13
             */
            removeBlockChannels(request: RemoveBlockChannelsRequest): MaybePromise;
        }
    }

    /**
     * {@link ContentControl} supports these elements if it supports feature "BlockApplications".
     */
    export namespace BlockApplicationsComponent {
        export interface Attributes {
            /**
             * Indicates a set of applications that shall be blocked when the Content Control feature is activated.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.10
             */
            readonly blockApplicationList: AppInfo[];
        }

        export interface Commands {
            /**
             * The purpose of this command is to set applications to the BlockApplicationList attribute.
             *
             * Upon receipt of the AddBlockApplications command, the media device shall check if the Applications passed
             * in this command are installed. If there is an application in Applications field which is not identified
             * by media device, then a response with UnidentifiableApplication error Status may be returned.
             *
             * If there is one or more applications which are not present in BlockApplicationList attribute, the media
             * device shall process the request by adding the new application to the BlockApplicationList attribute and
             * return a successful Status Response.
             *
             * If all applications in Applications field are already present in BlockApplicationList attribute, then a
             * response with ApplicationAlreadyExist error Status shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.14
             */
            addBlockApplications(request: AddBlockApplicationsRequest): MaybePromise;

            /**
             * The purpose of this command is to remove applications from the BlockApplicationList attribute.
             *
             * Upon receipt of the RemoveBlockApplications command, the media device shall check if the applications
             * passed in this command present in the BlockApplicationList attribute. If one or more applications in
             * Applications field which are not present in the BlockApplicationList attribute, then a response with
             * ApplicationNotExist error Status shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.15
             */
            removeBlockApplications(request: RemoveBlockApplicationsRequest): MaybePromise;
        }
    }

    /**
     * {@link ContentControl} supports these elements if it supports feature "BlockContentTimeWindow".
     */
    export namespace BlockContentTimeWindowComponent {
        export interface Attributes {
            /**
             * Indicates a set of periods during which the playback of content on media device shall be blocked when the
             * Content Control feature is activated. The media device shall reject any request to play content during
             * one period of this attribute. If it is entering any one period of this attribute, the media device shall
             * block content which is playing and generate an event EnteringBlockContentTimeWindow. There shall NOT be
             * multiple entries in this attribute list for the same day of week.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.11
             */
            readonly blockContentTimeWindow: TimeWindow[];
        }

        export interface Commands {
            /**
             * The purpose of this command is to set the BlockContentTimeWindow attribute.
             *
             * Upon receipt of the SetBlockContentTimeWindow command, the media device shall check if the
             * TimeWindowIndex field passed in this command is NULL. If the TimeWindowIndex field is NULL, the media
             * device shall check if there is an entry in the BlockContentTimeWindow attribute which matches with the
             * TimePeriod and DayOfWeek fields passed in this command. * If Yes, then a response with
             * TimeWindowAlreadyExist error status shall be returned. * If No, then the media device shall assign one
             * unique index for this time window and add it into the BlockContentTimeWindow list attribute.
             *
             * If the TimeWindowIndex field is not NULL and presents in the BlockContentTimeWindow attribute, the media
             * device shall replace the original time window with the new time window passed in this command.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.16
             */
            setBlockContentTimeWindow(request: SetBlockContentTimeWindowRequest): MaybePromise;

            /**
             * The purpose of this command is to remove the selected time windows from the BlockContentTimeWindow
             * attribute.
             *
             * Upon receipt of the RemoveBlockContentTimeWindow command, the media device shall check if the time window
             * index passed in this command presents in the BlockContentTimeWindow attribute.
             *
             * If one or more time window indexes passed in this command are not present in BlockContentTimeWindow
             * attribute, then a response with TimeWindowNotExist error status shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.17
             */
            removeBlockContentTimeWindow(request: RemoveBlockContentTimeWindowRequest): MaybePromise;
        }

        export interface Events {
            /**
             * This event shall be generated when entering a period of blocked content as configured in the
             * BlockContentTimeWindow attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.9.2
             */
            enteringBlockContentTimeWindow: void;
        }
    }

    /**
     * {@link ContentControl} supports these elements if it supports feature "PinManagement".
     */
    export namespace PinManagementComponent {
        export interface Commands {
            /**
             * The purpose of this command is to update the PIN used for protecting configuration of the content control
             * settings. Upon success, the old PIN shall no longer work.
             *
             * The PIN is used to ensure that only the Node (or User) with the PIN code can make changes to the Content
             * Control settings, for example, turn off Content Controls or modify the ScreenDailyTime. The PIN is
             * composed of a numeric string of up to 6 human readable characters (displayable) .
             *
             * Upon receipt of this command, the media device shall check if the OldPIN field of this command is the
             * same as the current PIN. If the PINs are the same, then the PIN code shall be set to NewPIN. Otherwise a
             * response with InvalidPINCode error status shall be returned.
             *
             * The media device may provide a default PIN to the User via an out of band mechanism. For security
             * reasons, it is recommended that a client encourage the user to update the PIN from its default value when
             * performing configuration of the Content Control settings exposed by this cluster. The ResetPIN command
             * can also be used to obtain the default PIN.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.1
             */
            updatePin(request: UpdatePinRequest): MaybePromise;

            /**
             * The purpose of this command is to reset the PIN.
             *
             * If this command is executed successfully, a ResetPINResponse command with a new PIN shall be returned.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.2
             */
            resetPin(): MaybePromise<ResetPinResponse>;
        }
    }

    /**
     * Attributes that may appear in {@link ContentControl}.
     *
     * Device support for attributes may be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates whether the Content Control feature implemented on a media device is turned off (FALSE) or turned
         * on (TRUE).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.1
         */
        readonly enabled: boolean;

        /**
         * This attribute shall provide the collection of ratings that are currently valid for this media device. The
         * items should honor the metadata of the on-demand content (e.g. Movie) rating system for one country or region
         * where the media device has been provisioned. For example, for the MPAA system, RatingName may be one value
         * out of "G", "PG", "PG-13", "R", "NC-17".
         *
         * The media device shall have a way to determine which rating system applies for the on-demand content and then
         * populate this attribute. For example, it can do it through examining the Location attribute in the Basic
         * Information cluster, and then determining which rating system applies.
         *
         * The ratings in this collection shall be in order from a rating for the youngest viewers to the one for the
         * oldest viewers. Each rating in the list shall be unique.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.2
         */
        readonly onDemandRatings: RatingName[];

        /**
         * Indicates a threshold rating as a content filter which is compared with the rating for on-demand content. For
         * example, if the on-demand content rating is greater than or equal to OnDemandRatingThreshold, for a rating
         * system that is ordered from lower viewer age to higher viewer age, then on-demand content is not appropriate
         * for the User and the Node shall prevent the playback of content.
         *
         * This attribute shall be set to one of the values present in the OnDemandRatings attribute.
         *
         * When this attribute changes, the device SHOULD make the user aware of any limits of this feature. For
         * example, if the feature does not control content within apps, then the device should make this clear to the
         * user when the attribute changes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.3
         */
        readonly onDemandRatingThreshold: string;

        /**
         * Indicates a collection of ratings which ScheduledContentRatingThreshold can be set to. The items should honor
         * metadata of the scheduled content rating system for the country or region where the media device has been
         * provisioned.
         *
         * The media device shall have a way to determine which scheduled content rating system applies and then
         * populate this attribute. For example, this can be done by examining the Location attribute in Basic
         * Information cluster, and then determining which rating system applies.
         *
         * The ratings in this collection shall be in order from a rating for the youngest viewers to the one for the
         * oldest viewers. Each rating in the list shall be unique.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.4
         */
        readonly scheduledContentRatings: RatingName[];

        /**
         * Indicates a threshold rating as a content filter which is used to compare with the rating for scheduled
         * content. For example, if the scheduled content rating is greater than or equal to
         * ScheduledContentRatingThreshold for a rating system that is ordered from lower viewer age to higher viewer
         * age, then the scheduled content is not appropriate for the User and shall be blocked.
         *
         * This attribute shall be set to one of the values present in the ScheduledContentRatings attribute.
         *
         * When this attribute changes, the device SHOULD make the user aware of any limits of this feature. For
         * example, if the feature does not control content within apps, then the device should make this clear to the
         * user when the attribute changes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.5
         */
        readonly scheduledContentRatingThreshold: string;

        /**
         * Indicates the amount of time (in seconds) which the User is allowed to spend watching TV within one day when
         * the Content Control feature is activated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.6
         */
        readonly screenDailyTime: number;

        /**
         * Indicates the remaining screen time (in seconds) which the User is allowed to spend watching TV for the
         * current day when the Content Control feature is activated. When this value equals 0, the media device shall
         * terminate the playback of content.
         *
         * This attribute shall be updated when the AddBonusTime command is received and processed successfully (with
         * the correct PIN).
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.7
         */
        readonly remainingScreenTime: number;

        /**
         * Indicates whether the playback of unrated content is allowed when the Content Control feature is activated.
         * If this attribute equals FALSE, then playback of unrated content shall be permitted. Otherwise, the media
         * device shall prevent the playback of unrated content.
         *
         * When this attribute changes, the device SHOULD make the user aware of any limits of this feature. For
         * example, if the feature does not control content within apps, then the device should make this clear to the
         * user when the attribute changes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.8
         */
        readonly blockUnrated: boolean;

        /**
         * Indicates a set of channels that shall be blocked when the Content Control feature is activated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.9
         */
        readonly blockChannelList: BlockChannel[];

        /**
         * Indicates a set of applications that shall be blocked when the Content Control feature is activated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.10
         */
        readonly blockApplicationList: AppInfo[];

        /**
         * Indicates a set of periods during which the playback of content on media device shall be blocked when the
         * Content Control feature is activated. The media device shall reject any request to play content during one
         * period of this attribute. If it is entering any one period of this attribute, the media device shall block
         * content which is playing and generate an event EnteringBlockContentTimeWindow. There shall NOT be multiple
         * entries in this attribute list for the same day of week.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.7.11
         */
        readonly blockContentTimeWindow: TimeWindow[];
    }

    export interface Commands extends Base.Commands, OnDemandContentRatingComponent.Commands, ScheduledContentRatingComponent.Commands, ScreenTimeComponent.Commands, BlockUnratedComponent.Commands, BlockChannelsComponent.Commands, BlockApplicationsComponent.Commands, BlockContentTimeWindowComponent.Commands, PinManagementComponent.Commands {}

    /**
     * Events that may appear in {@link ContentControl}.
     *
     * Device support for events may be affected by a device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when the RemainingScreenTime equals 0.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.9.1
         */
        remainingScreenTimeExpired: void;

        /**
         * This event shall be generated when entering a period of blocked content as configured in the
         * BlockContentTimeWindow attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.9.2
         */
        enteringBlockContentTimeWindow: void;
    }

    export type Components = [
        { flags: {}, attributes: Base.Attributes, commands: Base.Commands },
        {
            flags: { onDemandContentRating: true },
            attributes: OnDemandContentRatingComponent.Attributes,
            commands: OnDemandContentRatingComponent.Commands
        },
        {
            flags: { scheduledContentRating: true },
            attributes: ScheduledContentRatingComponent.Attributes,
            commands: ScheduledContentRatingComponent.Commands
        },

        {
            flags: { screenTime: true },
            attributes: ScreenTimeComponent.Attributes,
            commands: ScreenTimeComponent.Commands,
            events: ScreenTimeComponent.Events
        },

        {
            flags: { blockUnrated: true },
            attributes: BlockUnratedComponent.Attributes,
            commands: BlockUnratedComponent.Commands
        },
        {
            flags: { blockChannels: true },
            attributes: BlockChannelsComponent.Attributes,
            commands: BlockChannelsComponent.Commands
        },
        {
            flags: { blockApplications: true },
            attributes: BlockApplicationsComponent.Attributes,
            commands: BlockApplicationsComponent.Commands
        },

        {
            flags: { blockContentTimeWindow: true },
            attributes: BlockContentTimeWindowComponent.Attributes,
            commands: BlockContentTimeWindowComponent.Commands,
            events: BlockContentTimeWindowComponent.Events
        },

        { flags: { pinManagement: true }, commands: PinManagementComponent.Commands }
    ];

    export type Features = "ScreenTime" | "PinManagement" | "BlockUnrated" | "OnDemandContentRating" | "ScheduledContentRating" | "BlockChannels" | "BlockApplications" | "BlockContentTimeWindow";

    /**
     * These are optional features supported by ContentControlCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.4
     */
    export enum Feature {
        /**
         * ScreenTime (ST)
         *
         * Supports managing screen time limits.
         */
        ScreenTime = "ScreenTime",

        /**
         * PinManagement (PM)
         *
         * Supports managing a PIN code which is used for restricting access to configuration of this feature.
         */
        PinManagement = "PinManagement",

        /**
         * BlockUnrated (BU)
         *
         * Supports managing content controls for unrated content.
         */
        BlockUnrated = "BlockUnrated",

        /**
         * OnDemandContentRating (OCR)
         *
         * Supports managing content controls based upon rating threshold for on demand content.
         */
        OnDemandContentRating = "OnDemandContentRating",

        /**
         * ScheduledContentRating (SCR)
         *
         * Supports managing content controls based upon rating threshold for scheduled content.
         */
        ScheduledContentRating = "ScheduledContentRating",

        /**
         * BlockChannels (BC)
         *
         * Supports managing a set of channels that are prohibited.
         */
        BlockChannels = "BlockChannels",

        /**
         * BlockApplications (BA)
         *
         * Supports managing a set of applications that are prohibited.
         */
        BlockApplications = "BlockApplications",

        /**
         * BlockContentTimeWindow (BTW)
         *
         * Supports managing content controls based upon setting time window in which all contents and applications
         * SHALL be blocked.
         */
        BlockContentTimeWindow = "BlockContentTimeWindow"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.2
     */
    export interface RatingName {
        /**
         * This field shall indicate the name of the rating level of the applied rating system. The applied rating
         * system is dependent upon the region or country where the Node has been provisioned, and may vary from one
         * country to another.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.2.1
         */
        ratingName: string;

        /**
         * This field shall specify a human readable (displayable) description for RatingName.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.2.2
         */
        ratingNameDesc?: string;
    }

    /**
     * The purpose of this command is to set the OnDemandRatingThreshold attribute.
     *
     * Upon receipt of the SetOnDemandRatingThreshold command, the media device shall check if the Rating field is one
     * of values present in the OnDemandRatings attribute. If not, then a response with InvalidRating error status shall
     * be returned.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.10
     */
    export interface SetOnDemandRatingThresholdRequest {
        /**
         * This field indicates a threshold rating for filtering on-demand content. This field shall be set to one of
         * the values present in the OnDemandRatings attribute
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.10.1
         */
        rating: string;
    }

    /**
     * The purpose of this command is to set ScheduledContentRatingThreshold attribute.
     *
     * Upon receipt of the SetScheduledContentRatingThreshold command, the media device shall check if the Rating field
     * is one of values present in the ScheduledContentRatings attribute. If not, then a response with InvalidRating
     * error status shall be returned.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.11
     */
    export interface SetScheduledContentRatingThresholdRequest {
        /**
         * This field indicates a threshold rating for filtering scheduled content. This field shall be set to one of
         * the values present in the ScheduledContentRatings attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.11.1
         */
        rating: string;
    }

    /**
     * The purpose of this command is to add the extra screen time for the user.
     *
     * If a client with Operate privilege invokes this command, the media device shall check whether the PINCode passed
     * in the command matches the current PINCode value. If these match, then the RemainingScreenTime attribute shall be
     * increased by the specified BonusTime value.
     *
     * If the PINs do not match, then a response with InvalidPINCode error status shall be returned, and no changes
     * shall be made to RemainingScreenTime.
     *
     * If a client with Manage privilege or greater invokes this command, the media device shall ignore the PINCode
     * field and directly increase the RemainingScreenTime attribute by the specified BonusTime value.
     *
     * A server that does not support the PM feature shall respond with InvalidPINCode to clients that only have Operate
     * privilege unless:
     *
     *   - It has been provided with the PIN value to expect via an out of band mechanism, and
     *
     *   - The client has provided a PINCode that matches the expected PIN value.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.6
     */
    export interface AddBonusTimeRequest {
        /**
         * This field shall indicate the PIN.
         *
         * This field shall be optional for clients with Manage or greater privilege but shall be mandatory for clients
         * with Operate privilege. The PIN provided in this field shall be used to guarantee that a client with Operate
         * permission is allowed to invoke this command only if the PIN passed in this command is equal to the current
         * PIN value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.6.1
         */
        pinCode?: string;

        /**
         * This field shall indicate the amount of extra time (in seconds) to increase RemainingScreenTime. This field
         * shall NOT exceed the remaining time of this day.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.6.2
         */
        bonusTime: number;
    }

    /**
     * The purpose of this command is to set the ScreenDailyTime attribute.
     *
     * Upon receipt of the SetScreenDailyTime command, the media device shall set the ScreenDailyTime attribute to the
     * ScreenTime value.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.7
     */
    export interface SetScreenDailyTimeRequest {
        /**
         * This field shall indicate the time (in seconds) which the User is allowed to spend watching TV on this media
         * device within one day.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.7.1
         */
        screenTime: number;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.3
     */
    export interface BlockChannel {
        /**
         * This field shall indicate a unique index value for a blocked channel. This value may be used to indicate one
         * selected channel which will be removed from BlockChannelList attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.3.1
         */
        blockChannelIndex: number | null;

        /**
         * This field shall indicate the channel major number value (for example, using ATSC format). When the channel
         * number is expressed as a string, such as "13.1" or "256", the major number would be 13 or 256, respectively.
         * This field is required but shall be set to 0 for channels such as over-the-top channels that are not
         * represented by a major or minor number.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.3.2
         */
        majorNumber: number;

        /**
         * This field shall indicate the channel minor number value (for example, using ATSC format). When the channel
         * number is expressed as a string, such as "13.1" or "256", the minor number would be 1 or 0, respectively.
         * This field is required but shall be set to 0 for channels such as over-the-top channels that are not
         * represented by a major or minor number.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.3.3
         */
        minorNumber: number;

        /**
         * This field shall indicate the unique identifier for a specific channel. This field is optional, but SHOULD be
         * provided when MajorNumber and MinorNumber are not available.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.3.4
         */
        identifier?: string;
    }

    /**
     * The purpose of this command is to set BlockChannelList attribute.
     *
     * Upon receipt of the AddBlockChannels command, the media device shall check if the channels passed in this command
     * are valid. If the channel is invalid, then a response with InvalidChannel error Status shall be returned.
     *
     * If there is at least one channel in Channels field which is not in the BlockChannelList attribute, the media
     * device shall process the request by adding these new channels into the BlockChannelList attribute and return a
     * successful Status Response. During this process, the media device shall assign one unique index to
     * BlockChannelIndex field for every channel passed in this command.
     *
     * If all channels in Channel field already exist in the BlockChannelList attribute, then a response with
     * ChannelAlreadyExist error Status shall be returned.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.12
     */
    export interface AddBlockChannelsRequest {
        /**
         * This field indicates a set of channels that shall be blocked when the Content Control feature is activated.
         * This field shall be set to values present in ChannelList attribute in the Channel cluster. The
         * BlockChannelIndex field passed in this command shall be NULL.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.12.1
         */
        channels: BlockChannel[];
    }

    /**
     * The purpose of this command is to remove channels from the BlockChannelList attribute.
     *
     * Upon receipt of the RemoveBlockChannels command, the media device shall check if the channels indicated by
     * ChannelIndexes passed in this command are present in BlockChannelList attribute. If one or more channels
     * indicated by ChannelIndexes passed in this command field are not present in the BlockChannelList attribute, then
     * a response with ChannelNotExist error Status shall be returned.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.13
     */
    export interface RemoveBlockChannelsRequest {
        /**
         * This field shall specify a set of indexes indicating Which channels shall be removed from the
         * BlockChannelList attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.13.1
         */
        channelIndexes: number[];
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.4
     */
    export interface AppInfo {
        /**
         * This field shall indicate the Connectivity Standards Alliance-issued vendor ID for the catalog. The DIAL
         * registry shall use value 0x0000.
         *
         * Content App Platform providers will have their own catalog vendor ID (set to their own Vendor ID) and will
         * assign an ApplicationID to each Content App.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.4.1
         */
        catalogVendorId: number;

        /**
         * This field shall indicate the application identifier, expressed as a string, such as "PruneVideo" or "Company
         * X". This field shall be unique within a catalog.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.4.2
         */
        applicationId: string;
    }

    /**
     * The purpose of this command is to set applications to the BlockApplicationList attribute.
     *
     * Upon receipt of the AddBlockApplications command, the media device shall check if the Applications passed in this
     * command are installed. If there is an application in Applications field which is not identified by media device,
     * then a response with UnidentifiableApplication error Status may be returned.
     *
     * If there is one or more applications which are not present in BlockApplicationList attribute, the media device
     * shall process the request by adding the new application to the BlockApplicationList attribute and return a
     * successful Status Response.
     *
     * If all applications in Applications field are already present in BlockApplicationList attribute, then a response
     * with ApplicationAlreadyExist error Status shall be returned.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.14
     */
    export interface AddBlockApplicationsRequest {
        /**
         * This field indicates a set of applications that shall be blocked when the Content Control feature is
         * activated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.14.1
         */
        applications: AppInfo[];
    }

    /**
     * The purpose of this command is to remove applications from the BlockApplicationList attribute.
     *
     * Upon receipt of the RemoveBlockApplications command, the media device shall check if the applications passed in
     * this command present in the BlockApplicationList attribute. If one or more applications in Applications field
     * which are not present in the BlockApplicationList attribute, then a response with ApplicationNotExist error
     * Status shall be returned.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.15
     */
    export interface RemoveBlockApplicationsRequest {
        /**
         * This field indicates a set of applications which shall be removed from BlockApplicationList attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.15.1
         */
        applications: AppInfo[];
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.5
     */
    export interface TimeWindow {
        /**
         * This field shall indicate a unique index of a specific time window. This value may be used to indicate a
         * selected time window which will be removed from the BlockContentTimeWindow attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.5.1
         */
        timeWindowIndex: number | null;

        /**
         * This field shall indicate a day of week.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.5.2
         */
        dayOfWeek: DayOfWeek;

        /**
         * This field shall indicate one or more discrete time periods.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.5.3
         */
        timePeriod: TimePeriod[];
    }

    /**
     * The purpose of this command is to set the BlockContentTimeWindow attribute.
     *
     * Upon receipt of the SetBlockContentTimeWindow command, the media device shall check if the TimeWindowIndex field
     * passed in this command is NULL. If the TimeWindowIndex field is NULL, the media device shall check if there is an
     * entry in the BlockContentTimeWindow attribute which matches with the TimePeriod and DayOfWeek fields passed in
     * this command. * If Yes, then a response with TimeWindowAlreadyExist error status shall be returned. * If No, then
     * the media device shall assign one unique index for this time window and add it into the BlockContentTimeWindow
     * list attribute.
     *
     * If the TimeWindowIndex field is not NULL and presents in the BlockContentTimeWindow attribute, the media device
     * shall replace the original time window with the new time window passed in this command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.16
     */
    export interface SetBlockContentTimeWindowRequest {
        /**
         * This field shall indicate a time window requested to set to the BlockContentTimeWindow attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.16.1
         */
        timeWindow: TimeWindow;
    }

    /**
     * The purpose of this command is to remove the selected time windows from the BlockContentTimeWindow attribute.
     *
     * Upon receipt of the RemoveBlockContentTimeWindow command, the media device shall check if the time window index
     * passed in this command presents in the BlockContentTimeWindow attribute.
     *
     * If one or more time window indexes passed in this command are not present in BlockContentTimeWindow attribute,
     * then a response with TimeWindowNotExist error status shall be returned.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.17
     */
    export interface RemoveBlockContentTimeWindowRequest {
        /**
         * This field shall specify a set of time window indexes indicating which time windows will be removed from the
         * BlockContentTimeWindow attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.17.1
         */
        timeWindowIndexes: number[];
    }

    /**
     * The purpose of this command is to update the PIN used for protecting configuration of the content control
     * settings. Upon success, the old PIN shall no longer work.
     *
     * The PIN is used to ensure that only the Node (or User) with the PIN code can make changes to the Content Control
     * settings, for example, turn off Content Controls or modify the ScreenDailyTime. The PIN is composed of a numeric
     * string of up to 6 human readable characters (displayable) .
     *
     * Upon receipt of this command, the media device shall check if the OldPIN field of this command is the same as the
     * current PIN. If the PINs are the same, then the PIN code shall be set to NewPIN. Otherwise a response with
     * InvalidPINCode error status shall be returned.
     *
     * The media device may provide a default PIN to the User via an out of band mechanism. For security reasons, it is
     * recommended that a client encourage the user to update the PIN from its default value when performing
     * configuration of the Content Control settings exposed by this cluster. The ResetPIN command can also be used to
     * obtain the default PIN.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.1
     */
    export interface UpdatePinRequest {
        /**
         * This field shall specify the original PIN. Once the UpdatePIN command is performed successfully, it shall be
         * invalid.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.1.1
         */
        oldPin: string;

        /**
         * This field shall indicate a new PIN for the Content Control feature.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.1.2
         */
        newPin: string;
    }

    /**
     * This command shall be generated in response to a ResetPIN command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.3
     */
    export interface ResetPinResponse {
        /**
         * This field shall indicate a new PIN of the Content Control feature.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.3.1
         */
        pinCode: string;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.1
     */
    export interface DayOfWeek {
        /**
         * Sunday
         */
        sunday?: boolean;

        /**
         * Monday
         */
        monday?: boolean;

        /**
         * Tuesday
         */
        tuesday?: boolean;

        /**
         * Wednesday
         */
        wednesday?: boolean;

        /**
         * Thursday
         */
        thursday?: boolean;

        /**
         * Friday
         */
        friday?: boolean;

        /**
         * Saturday
         */
        saturday?: boolean;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.6
     */
    export interface TimePeriod {
        /**
         * This field shall indicate the starting hour.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.6.1
         */
        startHour: number;

        /**
         * This field shall indicate the starting minute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.6.2
         */
        startMinute: number;

        /**
         * This field shall indicate the ending hour. EndHour shall be equal to or greater than StartHour
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.6.3
         */
        endHour: number;

        /**
         * This field shall indicate the ending minute. If EndHour is equal to StartHour then EndMinute shall be greater
         * than StartMinute. If the EndHour is equal to 23 and the EndMinute is equal to 59, all contents shall be
         * blocked until 23:59:59.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.5.6.4
         */
        endMinute: number;
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.6.1
     */
    export enum StatusCode {
        /**
         * Provided PIN Code does not match the current PIN code.
         */
        InvalidPinCode = 2,

        /**
         * Provided Rating is out of scope of the corresponding Rating list.
         */
        InvalidRating = 3,

        /**
         * Provided Channel(s) is invalid.
         */
        InvalidChannel = 4,

        /**
         * Provided Channel(s) already exists.
         */
        ChannelAlreadyExist = 5,

        /**
         * Provided Channel(s) doesn’t exist in BlockChannelList attribute.
         */
        ChannelNotExist = 6,

        /**
         * Provided Application(s) is not identified.
         */
        UnidentifiableApplication = 7,

        /**
         * Provided Application(s) already exists.
         */
        ApplicationAlreadyExist = 8,

        /**
         * Provided Application(s) doesn’t exist in BlockApplicationList attribute.
         */
        ApplicationNotExist = 9,

        /**
         * Provided time Window already exists in BlockContentTimeWindow attribute.
         */
        TimeWindowAlreadyExist = 10,

        /**
         * Provided time window doesn’t exist in BlockContentTimeWindow attribute.
         */
        TimeWindowNotExist = 11
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidPinCode}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.6.1
     */
    export class InvalidPinCodeError extends StatusResponseError {
        constructor(
            message = "Provided PIN Code does not match the current PIN code",
            code = Status.Failure,
            clusterCode = StatusCode.InvalidPinCode
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidRating}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.6.1
     */
    export class InvalidRatingError extends StatusResponseError {
        constructor(
            message = "Provided Rating is out of scope of the corresponding Rating list",
            code = Status.Failure,
            clusterCode = StatusCode.InvalidRating
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.InvalidChannel}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.6.1
     */
    export class InvalidChannelError extends StatusResponseError {
        constructor(
            message = "Provided Channel(s) is invalid",
            code = Status.Failure,
            clusterCode = StatusCode.InvalidChannel
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.ChannelAlreadyExist}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.6.1
     */
    export class ChannelAlreadyExistError extends StatusResponseError {
        constructor(
            message = "Provided Channel(s) already exists",
            code = Status.Failure,
            clusterCode = StatusCode.ChannelAlreadyExist
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.ChannelNotExist}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.6.1
     */
    export class ChannelNotExistError extends StatusResponseError {
        constructor(
            message = "Provided Channel(s) doesn’t exist in BlockChannelList attribute",
            code = Status.Failure,
            clusterCode = StatusCode.ChannelNotExist
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.UnidentifiableApplication}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.6.1
     */
    export class UnidentifiableApplicationError extends StatusResponseError {
        constructor(
            message = "Provided Application(s) is not identified",
            code = Status.Failure,
            clusterCode = StatusCode.UnidentifiableApplication
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.ApplicationAlreadyExist}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.6.1
     */
    export class ApplicationAlreadyExistError extends StatusResponseError {
        constructor(
            message = "Provided Application(s) already exists",
            code = Status.Failure,
            clusterCode = StatusCode.ApplicationAlreadyExist
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.ApplicationNotExist}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.6.1
     */
    export class ApplicationNotExistError extends StatusResponseError {
        constructor(
            message = "Provided Application(s) doesn’t exist in BlockApplicationList attribute",
            code = Status.Failure,
            clusterCode = StatusCode.ApplicationNotExist
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.TimeWindowAlreadyExist}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.6.1
     */
    export class TimeWindowAlreadyExistError extends StatusResponseError {
        constructor(
            message = "Provided time Window already exists in BlockContentTimeWindow attribute",
            code = Status.Failure,
            clusterCode = StatusCode.TimeWindowAlreadyExist
        ) {
            super(message, code, clusterCode);
        }
    }

    /**
     * Thrown for cluster status code {@link StatusCode.TimeWindowNotExist}.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 6.13.6.1
     */
    export class TimeWindowNotExistError extends StatusResponseError {
        constructor(
            message = "Provided time window doesn’t exist in BlockContentTimeWindow attribute",
            code = Status.Failure,
            clusterCode = StatusCode.TimeWindowNotExist
        ) {
            super(message, code, clusterCode);
        }
    }

    export const id = ClusterId(0x50f);
    export const name = "ContentControl" as const;
    export const revision = 1;
    export const schema = ContentControlModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface CommandObjects extends ClusterNamespace.CommandObjects<Commands> {}
    export declare const commands: CommandObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export declare const events: EventObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof ContentControl;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `ContentControl` instead of `ContentControl.Complete`)
     */
    export type Complete = typeof ContentControl;

    export declare const Complete: Complete;
    export declare const Typing: ContentControl;
}

ClusterNamespace.define(ContentControl);
export type ContentControlCluster = ContentControl.Cluster;
export const ContentControlCluster = ContentControl.Cluster;
export interface ContentControl extends ClusterTyping { Attributes: ContentControl.Attributes; Commands: ContentControl.Commands; Events: ContentControl.Events; Features: ContentControl.Features; Components: ContentControl.Components }
