/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    ContentAppObserverServer as BaseContentAppObserverServer
} from "../behaviors/content-app-observer/ContentAppObserverServer.js";
import { OnOffClient as BaseOnOffClient } from "../behaviors/on-off/OnOffClient.js";
import { KeypadInputClient as BaseKeypadInputClient } from "../behaviors/keypad-input/KeypadInputClient.js";
import { ContentLauncherClient as BaseContentLauncherClient } from "../behaviors/content-launcher/ContentLauncherClient.js";
import {
    ApplicationBasicClient as BaseApplicationBasicClient
} from "../behaviors/application-basic/ApplicationBasicClient.js";
import { LevelControlClient as BaseLevelControlClient } from "../behaviors/level-control/LevelControlClient.js";
import { MessagesClient as BaseMessagesClient } from "../behaviors/messages/MessagesClient.js";
import { WakeOnLanClient as BaseWakeOnLanClient } from "../behaviors/wake-on-lan/WakeOnLanClient.js";
import { ChannelClient as BaseChannelClient } from "../behaviors/channel/ChannelClient.js";
import { TargetNavigatorClient as BaseTargetNavigatorClient } from "../behaviors/target-navigator/TargetNavigatorClient.js";
import { MediaPlaybackClient as BaseMediaPlaybackClient } from "../behaviors/media-playback/MediaPlaybackClient.js";
import { MediaInputClient as BaseMediaInputClient } from "../behaviors/media-input/MediaInputClient.js";
import { LowPowerClient as BaseLowPowerClient } from "../behaviors/low-power/LowPowerClient.js";
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
 * This defines conformance to the Casting Video Client device type.
 *
 * A Casting Video Client is a client that can launch content on a Casting Video Player, for example, a Smart Speaker or
 * a Content Provider phone app.
 *
 * @see {@link MatterSpecification.v16.Device} § 10.6
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
     * We provide this alias to the default implementation {@link OnOffClient} for convenience.
     */
    export const OnOffClient = BaseOnOffClient;

    /**
     * The KeypadInput cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link KeypadInputClient} for convenience.
     */
    export const KeypadInputClient = BaseKeypadInputClient;

    /**
     * The ContentLauncher cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ContentLauncherClient} for convenience.
     */
    export const ContentLauncherClient = BaseContentLauncherClient;

    /**
     * The ApplicationBasic cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ApplicationBasicClient} for convenience.
     */
    export const ApplicationBasicClient = BaseApplicationBasicClient;

    /**
     * The LevelControl cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link LevelControlClient} for convenience.
     */
    export const LevelControlClient = BaseLevelControlClient;

    /**
     * The Messages cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link MessagesClient} for convenience.
     */
    export const MessagesClient = BaseMessagesClient;

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
     * The MediaPlayback cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link MediaPlaybackClient} for convenience.
     */
    export const MediaPlaybackClient = BaseMediaPlaybackClient;

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
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { optional: { ContentAppObserver: ContentAppObserverServer }, mandatory: {} };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: {
            OnOff: OnOffClient,
            KeypadInput: KeypadInputClient,
            ContentLauncher: ContentLauncherClient,
            ApplicationBasic: ApplicationBasicClient
        },

        optional: {
            LevelControl: LevelControlClient,
            Messages: MessagesClient,
            WakeOnLan: WakeOnLanClient,
            Channel: ChannelClient,
            TargetNavigator: TargetNavigatorClient,
            MediaPlayback: MediaPlaybackClient,
            MediaInput: MediaInputClient,
            LowPower: LowPowerClient,
            AudioOutput: AudioOutputClient,
            ApplicationLauncher: ApplicationLauncherClient,
            AccountLogin: AccountLoginClient,
            ContentControl: ContentControlClient
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

Object.freeze(CastingVideoClientDeviceDefinition);
export const CastingVideoClientDevice: CastingVideoClientDevice = CastingVideoClientDeviceDefinition;
