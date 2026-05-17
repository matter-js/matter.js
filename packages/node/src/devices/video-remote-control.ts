/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OnOffClient as BaseOnOffClient } from "../behaviors/on-off/OnOffClient.js";
import { MediaPlaybackClient as BaseMediaPlaybackClient } from "../behaviors/media-playback/MediaPlaybackClient.js";
import { KeypadInputClient as BaseKeypadInputClient } from "../behaviors/keypad-input/KeypadInputClient.js";
import { LevelControlClient as BaseLevelControlClient } from "../behaviors/level-control/LevelControlClient.js";
import { WakeOnLanClient as BaseWakeOnLanClient } from "../behaviors/wake-on-lan/WakeOnLanClient.js";
import { ChannelClient as BaseChannelClient } from "../behaviors/channel/ChannelClient.js";
import { TargetNavigatorClient as BaseTargetNavigatorClient } from "../behaviors/target-navigator/TargetNavigatorClient.js";
import { MediaInputClient as BaseMediaInputClient } from "../behaviors/media-input/MediaInputClient.js";
import { LowPowerClient as BaseLowPowerClient } from "../behaviors/low-power/LowPowerClient.js";
import { ContentLauncherClient as BaseContentLauncherClient } from "../behaviors/content-launcher/ContentLauncherClient.js";
import { AudioOutputClient as BaseAudioOutputClient } from "../behaviors/audio-output/AudioOutputClient.js";
import {
    ApplicationLauncherClient as BaseApplicationLauncherClient
} from "../behaviors/application-launcher/ApplicationLauncherClient.js";
import { AccountLoginClient as BaseAccountLoginClient } from "../behaviors/account-login/AccountLoginClient.js";
import { ContentControlClient as BaseContentControlClient } from "../behaviors/content-control/ContentControlClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * This defines conformance to the Video Remote Control device type.
 *
 * A Video Remote Control is a client that can control a Video Player, for example, a traditional universal remote
 * control.
 *
 * @see {@link MatterSpecification.v151.Device} § 10.7
 */
export interface VideoRemoteControlDevice extends Identity<typeof VideoRemoteControlDeviceDefinition> {}

export namespace VideoRemoteControlRequirements {
    /**
     * The OnOff cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link OnOffClient} for convenience.
     */
    export const OnOffClient = BaseOnOffClient;

    /**
     * The MediaPlayback cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link MediaPlaybackClient} for convenience.
     */
    export const MediaPlaybackClient = BaseMediaPlaybackClient;

    /**
     * The KeypadInput cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link KeypadInputClient} for convenience.
     */
    export const KeypadInputClient = BaseKeypadInputClient;

    /**
     * The LevelControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LevelControlClient} for convenience.
     */
    export const LevelControlClient = BaseLevelControlClient;

    /**
     * The WakeOnLan cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link WakeOnLanClient} for convenience.
     */
    export const WakeOnLanClient = BaseWakeOnLanClient;

    /**
     * The Channel cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ChannelClient} for convenience.
     */
    export const ChannelClient = BaseChannelClient;

    /**
     * The TargetNavigator cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TargetNavigatorClient} for convenience.
     */
    export const TargetNavigatorClient = BaseTargetNavigatorClient;

    /**
     * The MediaInput cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link MediaInputClient} for convenience.
     */
    export const MediaInputClient = BaseMediaInputClient;

    /**
     * The LowPower cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LowPowerClient} for convenience.
     */
    export const LowPowerClient = BaseLowPowerClient;

    /**
     * The ContentLauncher cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ContentLauncherClient} for convenience.
     */
    export const ContentLauncherClient = BaseContentLauncherClient;

    /**
     * The AudioOutput cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link AudioOutputClient} for convenience.
     */
    export const AudioOutputClient = BaseAudioOutputClient;

    /**
     * The ApplicationLauncher cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ApplicationLauncherClient} for convenience.
     */
    export const ApplicationLauncherClient = BaseApplicationLauncherClient;

    /**
     * The AccountLogin cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link AccountLoginClient} for convenience.
     */
    export const AccountLoginClient = BaseAccountLoginClient;

    /**
     * The ContentControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ContentControlClient} for convenience.
     */
    export const ContentControlClient = BaseContentControlClient;

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { OnOff: OnOffClient, MediaPlayback: MediaPlaybackClient, KeypadInput: KeypadInputClient },

        optional: {
            LevelControl: LevelControlClient,
            WakeOnLan: WakeOnLanClient,
            Channel: ChannelClient,
            TargetNavigator: TargetNavigatorClient,
            MediaInput: MediaInputClient,
            LowPower: LowPowerClient,
            ContentLauncher: ContentLauncherClient,
            AudioOutput: AudioOutputClient,
            ApplicationLauncher: ApplicationLauncherClient,
            AccountLogin: AccountLoginClient,
            ContentControl: ContentControlClient
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

Object.freeze(VideoRemoteControlDeviceDefinition);
export const VideoRemoteControlDevice: VideoRemoteControlDevice = VideoRemoteControlDeviceDefinition;
