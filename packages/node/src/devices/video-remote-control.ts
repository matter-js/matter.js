/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OnOffBehavior as BaseOnOffBehavior } from "../behaviors/on-off/OnOffBehavior.js";
import { MediaPlaybackBehavior as BaseMediaPlaybackBehavior } from "../behaviors/media-playback/MediaPlaybackBehavior.js";
import { KeypadInputBehavior as BaseKeypadInputBehavior } from "../behaviors/keypad-input/KeypadInputBehavior.js";
import { LevelControlBehavior as BaseLevelControlBehavior } from "../behaviors/level-control/LevelControlBehavior.js";
import { WakeOnLanBehavior as BaseWakeOnLanBehavior } from "../behaviors/wake-on-lan/WakeOnLanBehavior.js";
import { ChannelBehavior as BaseChannelBehavior } from "../behaviors/channel/ChannelBehavior.js";
import {
    TargetNavigatorBehavior as BaseTargetNavigatorBehavior
} from "../behaviors/target-navigator/TargetNavigatorBehavior.js";
import { MediaInputBehavior as BaseMediaInputBehavior } from "../behaviors/media-input/MediaInputBehavior.js";
import { LowPowerBehavior as BaseLowPowerBehavior } from "../behaviors/low-power/LowPowerBehavior.js";
import {
    ContentLauncherBehavior as BaseContentLauncherBehavior
} from "../behaviors/content-launcher/ContentLauncherBehavior.js";
import { AudioOutputBehavior as BaseAudioOutputBehavior } from "../behaviors/audio-output/AudioOutputBehavior.js";
import {
    ApplicationLauncherBehavior as BaseApplicationLauncherBehavior
} from "../behaviors/application-launcher/ApplicationLauncherBehavior.js";
import { AccountLoginBehavior as BaseAccountLoginBehavior } from "../behaviors/account-login/AccountLoginBehavior.js";
import {
    ContentControlBehavior as BaseContentControlBehavior
} from "../behaviors/content-control/ContentControlBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * This defines conformance to the Video Remote Control device type.
 *
 * A Video Remote Control is a client that can control a Video Player, for example, a traditional universal remote
 * control.
 *
 * @see {@link MatterSpecification.v142.Device} § 10.7
 */
export interface VideoRemoteControlDevice extends Identity<typeof VideoRemoteControlDeviceDefinition> {}

export namespace VideoRemoteControlRequirements {
    /**
     * The OnOff cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link OnOffBehavior} for convenience.
     */
    export const OnOffBehavior = BaseOnOffBehavior;

    /**
     * The MediaPlayback cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link MediaPlaybackBehavior} for convenience.
     */
    export const MediaPlaybackBehavior = BaseMediaPlaybackBehavior;

    /**
     * The KeypadInput cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link KeypadInputBehavior} for convenience.
     */
    export const KeypadInputBehavior = BaseKeypadInputBehavior;

    /**
     * The LevelControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LevelControlBehavior} for convenience.
     */
    export const LevelControlBehavior = BaseLevelControlBehavior;

    /**
     * The WakeOnLan cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link WakeOnLanBehavior} for convenience.
     */
    export const WakeOnLanBehavior = BaseWakeOnLanBehavior;

    /**
     * The Channel cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ChannelBehavior} for convenience.
     */
    export const ChannelBehavior = BaseChannelBehavior;

    /**
     * The TargetNavigator cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TargetNavigatorBehavior} for convenience.
     */
    export const TargetNavigatorBehavior = BaseTargetNavigatorBehavior;

    /**
     * The MediaInput cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link MediaInputBehavior} for convenience.
     */
    export const MediaInputBehavior = BaseMediaInputBehavior;

    /**
     * The LowPower cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LowPowerBehavior} for convenience.
     */
    export const LowPowerBehavior = BaseLowPowerBehavior;

    /**
     * The ContentLauncher cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ContentLauncherBehavior} for convenience.
     */
    export const ContentLauncherBehavior = BaseContentLauncherBehavior;

    /**
     * The AudioOutput cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link AudioOutputBehavior} for convenience.
     */
    export const AudioOutputBehavior = BaseAudioOutputBehavior;

    /**
     * The ApplicationLauncher cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ApplicationLauncherBehavior} for convenience.
     */
    export const ApplicationLauncherBehavior = BaseApplicationLauncherBehavior;

    /**
     * The AccountLogin cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link AccountLoginBehavior} for convenience.
     */
    export const AccountLoginBehavior = BaseAccountLoginBehavior;

    /**
     * The ContentControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ContentControlBehavior} for convenience.
     */
    export const ContentControlBehavior = BaseContentControlBehavior;

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { OnOff: OnOffBehavior, MediaPlayback: MediaPlaybackBehavior, KeypadInput: KeypadInputBehavior },

        optional: {
            LevelControl: LevelControlBehavior,
            WakeOnLan: WakeOnLanBehavior,
            Channel: ChannelBehavior,
            TargetNavigator: TargetNavigatorBehavior,
            MediaInput: MediaInputBehavior,
            LowPower: LowPowerBehavior,
            ContentLauncher: ContentLauncherBehavior,
            AudioOutput: AudioOutputBehavior,
            ApplicationLauncher: ApplicationLauncherBehavior,
            AccountLogin: AccountLoginBehavior,
            ContentControl: ContentControlBehavior
        }
    };
}

export const VideoRemoteControlDeviceDefinition = MutableEndpoint({
    name: "VideoRemoteControl",
    deviceType: 0x2a,
    deviceRevision: 2,
    requirements: VideoRemoteControlRequirements,
    behaviors: SupportedBehaviors()
});

export const VideoRemoteControlDevice: VideoRemoteControlDevice = VideoRemoteControlDeviceDefinition;
