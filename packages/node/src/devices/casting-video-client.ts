/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    ContentAppObserverServer as BaseContentAppObserverServer
} from "../behaviors/content-app-observer/ContentAppObserverServer.js";
import { OnOffBehavior as BaseOnOffBehavior } from "../behaviors/on-off/OnOffBehavior.js";
import { KeypadInputBehavior as BaseKeypadInputBehavior } from "../behaviors/keypad-input/KeypadInputBehavior.js";
import {
    ContentLauncherBehavior as BaseContentLauncherBehavior
} from "../behaviors/content-launcher/ContentLauncherBehavior.js";
import {
    ApplicationBasicBehavior as BaseApplicationBasicBehavior
} from "../behaviors/application-basic/ApplicationBasicBehavior.js";
import { LevelControlBehavior as BaseLevelControlBehavior } from "../behaviors/level-control/LevelControlBehavior.js";
import { WakeOnLanBehavior as BaseWakeOnLanBehavior } from "../behaviors/wake-on-lan/WakeOnLanBehavior.js";
import { ChannelBehavior as BaseChannelBehavior } from "../behaviors/channel/ChannelBehavior.js";
import {
    TargetNavigatorBehavior as BaseTargetNavigatorBehavior
} from "../behaviors/target-navigator/TargetNavigatorBehavior.js";
import { MediaPlaybackBehavior as BaseMediaPlaybackBehavior } from "../behaviors/media-playback/MediaPlaybackBehavior.js";
import { MediaInputBehavior as BaseMediaInputBehavior } from "../behaviors/media-input/MediaInputBehavior.js";
import { LowPowerBehavior as BaseLowPowerBehavior } from "../behaviors/low-power/LowPowerBehavior.js";
import { AudioOutputBehavior as BaseAudioOutputBehavior } from "../behaviors/audio-output/AudioOutputBehavior.js";
import {
    ApplicationLauncherBehavior as BaseApplicationLauncherBehavior
} from "../behaviors/application-launcher/ApplicationLauncherBehavior.js";
import { AccountLoginBehavior as BaseAccountLoginBehavior } from "../behaviors/account-login/AccountLoginBehavior.js";
import {
    ContentControlBehavior as BaseContentControlBehavior
} from "../behaviors/content-control/ContentControlBehavior.js";
import { MessagesBehavior as BaseMessagesBehavior } from "../behaviors/messages/MessagesBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "#general";

/**
 * This defines conformance to the Casting Video Client device type.
 *
 * A Casting Video Client is a client that can launch content on a Casting Video Player, for example, a Smart Speaker or
 * a Content Provider phone app.
 *
 * @see {@link MatterSpecification.v142.Device} § 10.6
 */
export interface CastingVideoClientDevice extends Identity<typeof CastingVideoClientDeviceDefinition> {}

export namespace CastingVideoClientRequirements {
    /**
     * The ContentAppObserver cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ContentAppObserverServer} for convenience.
     */
    export const ContentAppObserverServer = BaseContentAppObserverServer;

    /**
     * The OnOff cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link OnOffBehavior} for convenience.
     */
    export const OnOffBehavior = BaseOnOffBehavior;

    /**
     * The KeypadInput cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link KeypadInputBehavior} for convenience.
     */
    export const KeypadInputBehavior = BaseKeypadInputBehavior;

    /**
     * The ContentLauncher cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ContentLauncherBehavior} for convenience.
     */
    export const ContentLauncherBehavior = BaseContentLauncherBehavior;

    /**
     * The ApplicationBasic cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ApplicationBasicBehavior} for convenience.
     */
    export const ApplicationBasicBehavior = BaseApplicationBasicBehavior;

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
     * The MediaPlayback cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link MediaPlaybackBehavior} for convenience.
     */
    export const MediaPlaybackBehavior = BaseMediaPlaybackBehavior;

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
     * The Messages cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link MessagesBehavior} for convenience.
     */
    export const MessagesBehavior = BaseMessagesBehavior;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { optional: { ContentAppObserver: ContentAppObserverServer }, mandatory: {} };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: {
            OnOff: OnOffBehavior,
            KeypadInput: KeypadInputBehavior,
            ContentLauncher: ContentLauncherBehavior,
            ApplicationBasic: ApplicationBasicBehavior
        },

        optional: {
            LevelControl: LevelControlBehavior,
            WakeOnLan: WakeOnLanBehavior,
            Channel: ChannelBehavior,
            TargetNavigator: TargetNavigatorBehavior,
            MediaPlayback: MediaPlaybackBehavior,
            MediaInput: MediaInputBehavior,
            LowPower: LowPowerBehavior,
            AudioOutput: AudioOutputBehavior,
            ApplicationLauncher: ApplicationLauncherBehavior,
            AccountLogin: AccountLoginBehavior,
            ContentControl: ContentControlBehavior,
            Messages: MessagesBehavior
        }
    };
}

export const CastingVideoClientDeviceDefinition = MutableEndpoint({
    name: "CastingVideoClient",
    deviceType: 0x29,
    deviceRevision: 2,
    requirements: CastingVideoClientRequirements,
    behaviors: SupportedBehaviors()
});

export const CastingVideoClientDevice: CastingVideoClientDevice = CastingVideoClientDeviceDefinition;
