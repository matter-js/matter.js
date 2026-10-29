/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChannelServer } from "@matter/main/behaviors/channel";
import { Channel } from "@matter/main/clusters/channel";
import { StatusResponse } from "@matter/main/types";

/**
 * The keys ChangeChannel compares its Match field with, in the priority order of § 6.6.7.1. A channel's number is
 * written as `Major.Minor`.
 */
const MATCH_PRIORITY: ((channel: Channel.ChannelInfo) => string | undefined)[] = [
    channel => channel.identifier,
    channel => channel.affiliateCallSign,
    channel => channel.callSign,
    channel => channel.name,
    channel => `${channel.majorNumber}.${channel.minorNumber}`,
];

function sameNumber(a: Channel.ChannelInfo, b: Channel.ChannelInfo) {
    return a.majorNumber === b.majorNumber && a.minorNumber === b.minorNumber;
}

/**
 * A channel tuner with the features chip's tv-app declares on its video player endpoint (ChannelList and LineupInfo,
 * FeatureMap 3). Every command changes CurrentChannel to a channel of the ChannelList, so the endpoint must enable
 * CurrentChannel.
 *
 * | Command               | Answer for a channel in ChannelList | Otherwise                                  |
 * | --------------------- | ----------------------------------- | ------------------------------------------ |
 * | ChangeChannel         | Success                             | NoMatches, or MultipleMatches for a tie¹   |
 * | ChangeChannelByNumber | Success, also for the current one   | FAILURE, as chip's tv-app answers          |
 * | SkipChannel           | Success, wrapping at the list ends  | INVALID_IN_STATE without a current channel |
 *
 * ¹ The highest-priority key that matches anything decides; more than one channel with it is a tie. The specification
 * gives the priority order but no rule for a tie.
 *
 * @see {@link MatterSpecification.v161.Cluster} § 6.6.7
 */
export class TestChannelServer extends ChannelServer.with("ChannelList", "LineupInfo") {
    override changeChannel({ match }: Channel.ChangeChannelRequest): Channel.ChangeChannelResponse {
        const wanted = match.toLowerCase();
        for (const keyOf of MATCH_PRIORITY) {
            const matches = this.state.channelList.filter(channel => keyOf(channel)?.toLowerCase() === wanted);
            if (matches.length > 1) {
                return { status: Channel.Status.MultipleMatches };
            }
            if (matches.length === 1) {
                this.state.currentChannel = matches[0];
                return { status: Channel.Status.Success };
            }
        }
        return { status: Channel.Status.NoMatches };
    }

    override changeChannelByNumber({ majorNumber, minorNumber }: Channel.ChangeChannelByNumberRequest) {
        const channel = this.state.channelList.find(channel => sameNumber(channel, { majorNumber, minorNumber }));
        if (channel === undefined) {
            throw new StatusResponse.FailureError(`ChannelList has no channel ${majorNumber}.${minorNumber}`);
        }
        this.state.currentChannel = channel;
    }

    override skipChannel({ count }: Channel.SkipChannelRequest) {
        const { channelList, currentChannel } = this.state;
        const current =
            currentChannel === null || currentChannel === undefined
                ? -1
                : channelList.findIndex(channel => sameNumber(channel, currentChannel));
        if (current === -1) {
            throw new StatusResponse.InvalidInStateError("SkipChannel needs a current channel from ChannelList");
        }
        const size = channelList.length;
        this.state.currentChannel = channelList[(((current + count) % size) + size) % size];
    }
}
