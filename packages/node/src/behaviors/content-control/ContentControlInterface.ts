/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { ContentControl } from "#clusters/content-control";

export namespace ContentControlInterface {
    export interface Base {
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

    export interface OnDemandContentRating {
        /**
         * The purpose of this command is to set the OnDemandRatingThreshold attribute.
         *
         * Upon receipt of the SetOnDemandRatingThreshold command, the media device shall check if the Rating field is
         * one of values present in the OnDemandRatings attribute. If not, then a response with InvalidRating error
         * status shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.10
         */
        setOnDemandRatingThreshold(request: ContentControl.SetOnDemandRatingThresholdRequest): MaybePromise;
    }

    export interface ScheduledContentRating {
        /**
         * The purpose of this command is to set ScheduledContentRatingThreshold attribute.
         *
         * Upon receipt of the SetScheduledContentRatingThreshold command, the media device shall check if the Rating
         * field is one of values present in the ScheduledContentRatings attribute. If not, then a response with
         * InvalidRating error status shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.11
         */
        setScheduledContentRatingThreshold(request: ContentControl.SetScheduledContentRatingThresholdRequest): MaybePromise;
    }

    export interface ScreenTime {
        /**
         * The purpose of this command is to add the extra screen time for the user.
         *
         * If a client with Operate privilege invokes this command, the media device shall check whether the PINCode
         * passed in the command matches the current PINCode value. If these match, then the RemainingScreenTime
         * attribute shall be increased by the specified BonusTime value.
         *
         * If the PINs do not match, then a response with InvalidPINCode error status shall be returned, and no changes
         * shall be made to RemainingScreenTime.
         *
         * If a client with Manage privilege or greater invokes this command, the media device shall ignore the PINCode
         * field and directly increase the RemainingScreenTime attribute by the specified BonusTime value.
         *
         * A server that does not support the PM feature shall respond with InvalidPINCode to clients that only have
         * Operate privilege unless:
         *
         *   • It has been provided with the PIN value to expect via an out of band mechanism, and
         *
         *   • The client has provided a PINCode that matches the expected PIN value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.6
         */
        addBonusTime(request: ContentControl.AddBonusTimeRequest): MaybePromise;

        /**
         * The purpose of this command is to set the ScreenDailyTime attribute.
         *
         * Upon receipt of the SetScreenDailyTime command, the media device shall set the ScreenDailyTime attribute to
         * the ScreenTime value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.7
         */
        setScreenDailyTime(request: ContentControl.SetScreenDailyTimeRequest): MaybePromise;
    }

    export interface BlockUnrated {
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
         * Upon receipt of the UnblockUnratedContent command, the media device shall set the BlockUn rated attribute to
         * FALSE.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.9
         */
        unblockUnratedContent(): MaybePromise;
    }

    export interface BlockChannels {
        /**
         * The purpose of this command is to set BlockChannelList attribute.
         *
         * Upon receipt of the AddBlockChannels command, the media device shall check if the channels passed in this
         * command are valid. If the channel is invalid, then a response with InvalidChannel error Status shall be
         * returned.
         *
         * If there is at least one channel in Channels field which is not in the BlockChannelList attribute, the media
         * device shall process the request by adding these new channels into the BlockChannelList attribute and return
         * a successful Status Response. During this process, the media device shall assign one unique index to
         * BlockChannelIndex field for every channel passed in this command.
         *
         * If all channels in Channel field already exist in the BlockChannelList attribute, then a response with
         * ChannelAlreadyExist error Status shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.12
         */
        addBlockChannels(request: ContentControl.AddBlockChannelsRequest): MaybePromise;

        /**
         * The purpose of this command is to remove channels from the BlockChannelList attribute.
         *
         * Upon receipt of the RemoveBlockChannels command, the media device shall check if the channels indicated by
         * ChannelIndexes passed in this command are present in BlockChannelList attribute. If one or more channels
         * indicated by ChannelIndexes passed in this command field are not present in the BlockChannelList attribute,
         * then a response with ChannelNotExist error Status shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.13
         */
        removeBlockChannels(request: ContentControl.RemoveBlockChannelsRequest): MaybePromise;
    }

    export interface BlockApplications {
        /**
         * The purpose of this command is to set applications to the BlockApplicationList attribute.
         *
         * Upon receipt of the AddBlockApplications command, the media device shall check if the Applications passed in
         * this command are installed. If there is an application in Applications field which is not identified by media
         * device, then a response with UnidentifiableApplication error Status may be returned.
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
        addBlockApplications(request: ContentControl.AddBlockApplicationsRequest): MaybePromise;

        /**
         * The purpose of this command is to remove applications from the BlockApplicationList attribute.
         *
         * Upon receipt of the RemoveBlockApplications command, the media device shall check if the applications passed
         * in this command present in the BlockApplicationList attribute. If one or more applications in Applications
         * field which are not present in the BlockApplicationList attribute, then a response with ApplicationNotExist
         * error Status shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.15
         */
        removeBlockApplications(request: ContentControl.RemoveBlockApplicationsRequest): MaybePromise;
    }

    export interface BlockContentTimeWindow {
        /**
         * The purpose of this command is to set the BlockContentTimeWindow attribute.
         *
         * Upon receipt of the SetBlockContentTimeWindow command, the media device shall check if the TimeWindowIndex
         * field passed in this command is NULL. If the TimeWindowIndex field is NULL, the media device shall check if
         * there is an entry in the BlockContentTimeWindow attribute which matches with the TimePeriod and DayOfWeek
         * fields passed in this command. * If Yes, then a response with TimeWindowAlreadyExist error status shall be
         * returned. * If No, then the media device shall assign one unique index for this time window and add it into
         * the BlockContentTimeWindow list attribute.
         *
         * If the TimeWindowIndex field is not NULL and presents in the BlockContentTimeWindow attribute, the media
         * device shall replace the original time window with the new time window passed in this command.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.16
         */
        setBlockContentTimeWindow(request: ContentControl.SetBlockContentTimeWindowRequest): MaybePromise;

        /**
         * The purpose of this command is to remove the selected time windows from the BlockContentTimeWindow attribute.
         *
         * Upon receipt of the RemoveBlockContentTimeWindow command, the media device shall check if the time window
         * index passed in this command presents in the BlockContentTimeWindow attribute.
         *
         * If one or more time window indexes passed in this command are not present in BlockContentTimeWindow
         * attribute, then a response with TimeWindowNotExist error status shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.17
         */
        removeBlockContentTimeWindow(request: ContentControl.RemoveBlockContentTimeWindowRequest): MaybePromise;
    }

    export interface PinManagement {
        /**
         * The purpose of this command is to update the PIN used for protecting configuration of the content control
         * settings. Upon success, the old PIN shall no longer work.
         *
         * The PIN is used to ensure that only the Node (or User) with the PIN code can make changes to the Content
         * Control settings, for example, turn off Content Controls or modify the ScreenDailyTime. The PIN is composed
         * of a numeric string of up to 6 human readable characters (displayable) .
         *
         * Upon receipt of this command, the media device shall check if the OldPIN field of this command is the same as
         * the current PIN. If the PINs are the same, then the PIN code shall be set to NewPIN. Otherwise a response
         * with InvalidPINCode error status shall be returned.
         *
         * The media device may provide a default PIN to the User via an out of band mechanism. For security reasons, it
         * is recommended that a client encourage the user to update the PIN from its default value when performing
         * configuration of the Content Control settings exposed by this cluster. The ResetPIN command can also be used
         * to obtain the default PIN.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.1
         */
        updatePin(request: ContentControl.UpdatePinRequest): MaybePromise;

        /**
         * The purpose of this command is to reset the PIN.
         *
         * If this command is executed successfully, a ResetPINResponse command with a new PIN shall be returned.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.13.8.2
         */
        resetPin(): MaybePromise<ContentControl.ResetPinResponse>;
    }
}

export type ContentControlInterface = {
    components: [
        { flags: {}, methods: ContentControlInterface.Base },
        { flags: { onDemandContentRating: true }, methods: ContentControlInterface.OnDemandContentRating },
        { flags: { scheduledContentRating: true }, methods: ContentControlInterface.ScheduledContentRating },
        { flags: { screenTime: true }, methods: ContentControlInterface.ScreenTime },
        { flags: { blockUnrated: true }, methods: ContentControlInterface.BlockUnrated },
        { flags: { blockChannels: true }, methods: ContentControlInterface.BlockChannels },
        { flags: { blockApplications: true }, methods: ContentControlInterface.BlockApplications },
        { flags: { blockContentTimeWindow: true }, methods: ContentControlInterface.BlockContentTimeWindow },
        { flags: { pinManagement: true }, methods: ContentControlInterface.PinManagement }
    ]
};
