/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import { SwitchServer as BaseSwitchServer } from "../behaviors/switch/SwitchServer.js";
import {
    CameraAvStreamManagementServer as BaseCameraAvStreamManagementServer
} from "../behaviors/camera-av-stream-management/CameraAvStreamManagementServer.js";
import {
    WebRtcTransportProviderServer as BaseWebRtcTransportProviderServer
} from "../behaviors/web-rtc-transport-provider/WebRtcTransportProviderServer.js";
import {
    WebRtcTransportRequestorServer as BaseWebRtcTransportRequestorServer
} from "../behaviors/web-rtc-transport-requestor/WebRtcTransportRequestorServer.js";
import {
    PushAvStreamTransportServer as BasePushAvStreamTransportServer
} from "../behaviors/push-av-stream-transport/PushAvStreamTransportServer.js";
import {
    WebRtcTransportRequestorClient as BaseWebRtcTransportRequestorClient
} from "../behaviors/web-rtc-transport-requestor/WebRtcTransportRequestorClient.js";
import { ChimeClient as BaseChimeClient } from "../behaviors/chime/ChimeClient.js";
import {
    WebRtcTransportProviderClient as BaseWebRtcTransportProviderClient
} from "../behaviors/web-rtc-transport-provider/WebRtcTransportProviderClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * An Audio Doorbell device is composed in all cases with a generic switch to provide a doorbell with Audio only
 * streaming.
 *
 * AudioDoorbellDevice requires Switch and CameraAvStreamManagement clusters but they are not added by default because
 * you must select the features your device supports. You can add manually using AudioDoorbellDevice.with().
 *
 * @see {@link MatterSpecification.v151.Device} § 16.5
 */
export interface AudioDoorbellDevice extends Identity<typeof AudioDoorbellDeviceDefinition> {}

export namespace AudioDoorbellRequirements {
    /**
     * The Identify cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The Switch cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link SwitchServer} for convenience.
     */
    export const SwitchServer = BaseSwitchServer;

    /**
     * The CameraAvStreamManagement cluster is required by the Matter specification.
     *
     * This version of {@link CameraAvStreamManagementServer} is specialized per the specification.
     */
    export const CameraAvStreamManagementServer = BaseCameraAvStreamManagementServer.with("Audio");

    /**
     * The WebRtcTransportProvider cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WebRtcTransportProviderServer} for convenience.
     */
    export const WebRtcTransportProviderServer = BaseWebRtcTransportProviderServer;

    /**
     * The WebRtcTransportRequestor cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link WebRtcTransportRequestorServer} for convenience.
     */
    export const WebRtcTransportRequestorServer = BaseWebRtcTransportRequestorServer;

    /**
     * The PushAvStreamTransport cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link PushAvStreamTransportServer} for convenience.
     */
    export const PushAvStreamTransportServer = BasePushAvStreamTransportServer;

    /**
     * The WebRtcTransportRequestor cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WebRtcTransportRequestorClient} for convenience.
     */
    export const WebRtcTransportRequestorClient = BaseWebRtcTransportRequestorClient;

    /**
     * The Chime cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link ChimeClient} for convenience.
     */
    export const ChimeClient = BaseChimeClient;

    /**
     * The WebRtcTransportProvider cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link WebRtcTransportProviderClient} for convenience.
     */
    export const WebRtcTransportProviderClient = BaseWebRtcTransportProviderClient;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            Identify: IdentifyServer,
            Switch: SwitchServer,
            CameraAvStreamManagement: CameraAvStreamManagementServer,
            WebRtcTransportProvider: WebRtcTransportProviderServer
        },

        optional: {
            WebRtcTransportRequestor: WebRtcTransportRequestorServer,
            PushAvStreamTransport: PushAvStreamTransportServer
        }
    };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { WebRtcTransportRequestor: WebRtcTransportRequestorClient, Chime: ChimeClient },
        optional: { WebRtcTransportProvider: WebRtcTransportProviderClient }
    };
}

export const AudioDoorbellDeviceDefinition = MutableEndpoint({
    name: "AudioDoorbell",
    deviceType: 0x141,
    deviceRevision: 2,
    requirements: AudioDoorbellRequirements,
    behaviors: SupportedBehaviors(
        AudioDoorbellRequirements.server.mandatory.Identify,
        AudioDoorbellRequirements.server.mandatory.WebRtcTransportProvider
    )
});

Object.freeze(AudioDoorbellDeviceDefinition);
export const AudioDoorbellDevice: AudioDoorbellDevice = AudioDoorbellDeviceDefinition;
