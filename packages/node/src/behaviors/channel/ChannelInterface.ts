/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { Channel } from "#clusters/channel";

export namespace ChannelInterface {
    export interface Base {
        /**
         * Change the channel to the channel with the given Number in the ChannelList attribute.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.6.7.3
         */
        changeChannelByNumber(request: Channel.ChangeChannelByNumberRequest): MaybePromise;

        /**
         * This command provides channel up and channel down functionality, but allows channel index jumps of size
         * Count.
         *
         * Jumps are relative to the available list of channels. For example, when the current channel is 100.0 and the
         * list of available channels is [100.0, 200.0, 201.0, 305.1], a SkipChannel command with jump value of 2 shall
         * change the channel to 201.0.
         *
         * When the value of the increase or decrease is larger than the number of channels remaining in the given
         * direction, then the behavior shall be to return to the beginning (or end) of the channel list and continue.
         * For example, if the current channel is at index 0 and count value of -1 is given, then the current channel
         * should change to the last channel.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.6.7.4
         */
        skipChannel(request: Channel.SkipChannelRequest): MaybePromise;
    }

    export interface ChannelListOrLineupInfo {
        /**
         * Change the channel to the channel case-insensitive exact matching the value passed as an argument.
         *
         * The match priority order shall be: Identifier, AffiliateCallSign, CallSign, Name, Number. In the match
         * string, the Channel number should be presented in the "Major.Minor" format, such as "13.1".
         *
         * Upon receipt, this shall generate a ChangeChannelResponse command.
         *
         * Upon success, the CurrentChannel attribute, if supported, shall be updated to reflect the change.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.6.7.1
         */
        changeChannel(request: Channel.ChangeChannelRequest): MaybePromise<Channel.ChangeChannelResponse>;
    }

    export interface ElectronicGuide {
        /**
         * This command retrieves the program guide. It accepts several filter parameters to return specific schedule
         * and program information from a content app. The command shall receive in response a ProgramGuideResponse.
         * Standard error codes shall be used when arguments provided are not valid. For example, if StartTime is
         * greater than EndTime, the status code INVALID_ACTION shall be returned.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.6.7.5
         */
        getProgramGuide(request: Channel.GetProgramGuideRequest): MaybePromise<Channel.ProgramGuideResponse>;
    }

    export interface RecordProgramAndElectronicGuide {
        /**
         * Record a specific program or series when it goes live. This functionality enables DVR recording features.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.6.7.7
         */
        recordProgram(request: Channel.RecordProgramRequest): MaybePromise;

        /**
         * Cancel recording for a specific program or series.
         *
         * @see {@link MatterSpecification.v141.Cluster} § 6.6.7.8
         */
        cancelRecordProgram(request: Channel.CancelRecordProgramRequest): MaybePromise;
    }
}

export type ChannelInterface = {
    components: [
        { flags: {}, methods: ChannelInterface.Base },
        { flags: { channelList: true }, methods: ChannelInterface.ChannelListOrLineupInfo },
        { flags: { lineupInfo: true }, methods: ChannelInterface.ChannelListOrLineupInfo },
        { flags: { electronicGuide: true }, methods: ChannelInterface.ElectronicGuide },
        {
            flags: { recordProgram: true, electronicGuide: true },
            methods: ChannelInterface.RecordProgramAndElectronicGuide
        }
    ]
};
