/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OnOffServer as BaseOnOffServer } from "../behaviors/on-off/OnOffServer.js";
import { MediaPlaybackServer as BaseMediaPlaybackServer } from "../behaviors/media-playback/MediaPlaybackServer.js";
import { KeypadInputServer as BaseKeypadInputServer } from "../behaviors/keypad-input/KeypadInputServer.js";
import { WakeOnLanServer as BaseWakeOnLanServer } from "../behaviors/wake-on-lan/WakeOnLanServer.js";
import { ChannelServer as BaseChannelServer } from "../behaviors/channel/ChannelServer.js";
import { TargetNavigatorServer as BaseTargetNavigatorServer } from "../behaviors/target-navigator/TargetNavigatorServer.js";
import { MediaInputServer as BaseMediaInputServer } from "../behaviors/media-input/MediaInputServer.js";
import { LowPowerServer as BaseLowPowerServer } from "../behaviors/low-power/LowPowerServer.js";
import { AudioOutputServer as BaseAudioOutputServer } from "../behaviors/audio-output/AudioOutputServer.js";
import { ContentControlServer as BaseContentControlServer } from "../behaviors/content-control/ContentControlServer.js";
import { MessagesServer as BaseMessagesServer } from "../behaviors/messages/MessagesServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * This defines conformance to the Basic Video Player device type.
 *
 * A Video Player (either Basic or Casting) represents a device that is able to play media to a physical output or to a
 * display screen which is part of the device.
 *
 * A Basic Video Player has playback controls (play, pause, etc.) and keypad remote controls (up, down, number input),
 * but is not able to launch content and is not a content app platform (the Casting Video Player device type is used for
 * these functions).
 *
 * For example, a Basic Video Player can be a traditional TV device a physical media playback device such as a DVD
 * Player, or a device that provides input to another device like a TV or computer monitor.
 *
 * See Section 10.1, “Video Player Architecture” for additional Basic Video Player requirements relating to Video Player
 * device endpoint composition, commissioning, feature representation in clusters, and UI context.
 *
 * @see {@link MatterSpecification.v142.Device} § 10.2
 */
export interface BasicVideoPlayerDevice extends Identity<typeof BasicVideoPlayerDeviceDefinition> {}

export namespace BasicVideoPlayerRequirements {
    /**
     * The OnOff cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link OnOffServer} for convenience.
     */
    export const OnOffServer = BaseOnOffServer;

    /**
     * The MediaPlayback cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link MediaPlaybackServer} for convenience.
     */
    export const MediaPlaybackServer = BaseMediaPlaybackServer;

    /**
     * The KeypadInput cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link KeypadInputServer} for convenience.
     */
    export const KeypadInputServer = BaseKeypadInputServer;

    /**
     * The WakeOnLan cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link WakeOnLanServer} for convenience.
     */
    export const WakeOnLanServer = BaseWakeOnLanServer;

    /**
     * The Channel cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ChannelServer} for convenience.
     */
    export const ChannelServer = BaseChannelServer;

    /**
     * The TargetNavigator cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TargetNavigatorServer} for convenience.
     */
    export const TargetNavigatorServer = BaseTargetNavigatorServer;

    /**
     * The MediaInput cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link MediaInputServer} for convenience.
     */
    export const MediaInputServer = BaseMediaInputServer;

    /**
     * The LowPower cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LowPowerServer} for convenience.
     */
    export const LowPowerServer = BaseLowPowerServer;

    /**
     * The AudioOutput cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link AudioOutputServer} for convenience.
     */
    export const AudioOutputServer = BaseAudioOutputServer;

    /**
     * The ContentControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ContentControlServer} for convenience.
     */
    export const ContentControlServer = BaseContentControlServer;

    /**
     * The Messages cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link MessagesServer} for convenience.
     */
    export const MessagesServer = BaseMessagesServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { OnOff: OnOffServer, MediaPlayback: MediaPlaybackServer, KeypadInput: KeypadInputServer },

        optional: {
            WakeOnLan: WakeOnLanServer,
            Channel: ChannelServer,
            TargetNavigator: TargetNavigatorServer,
            MediaInput: MediaInputServer,
            LowPower: LowPowerServer,
            AudioOutput: AudioOutputServer,
            ContentControl: ContentControlServer,
            Messages: MessagesServer
        }
    };
}

export const BasicVideoPlayerDeviceDefinition = MutableEndpoint({
    name: "BasicVideoPlayer",
    deviceType: 0x28,
    deviceRevision: 2,
    requirements: BasicVideoPlayerRequirements,
    behaviors: SupportedBehaviors(
        BasicVideoPlayerRequirements.server.mandatory.OnOff,
        BasicVideoPlayerRequirements.server.mandatory.MediaPlayback,
        BasicVideoPlayerRequirements.server.mandatory.KeypadInput
    )
});

export const BasicVideoPlayerDevice: BasicVideoPlayerDevice = BasicVideoPlayerDeviceDefinition;
