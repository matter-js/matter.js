/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    CameraAvStreamManagementServer as BaseCameraAvStreamManagementServer
} from "../behaviors/camera-av-stream-management/CameraAvStreamManagementServer.js";
import {
    WebRtcTransportProviderServer as BaseWebRtcTransportProviderServer
} from "../behaviors/web-rtc-transport-provider/WebRtcTransportProviderServer.js";
import {
    WebRtcTransportRequestorServer as BaseWebRtcTransportRequestorServer
} from "../behaviors/web-rtc-transport-requestor/WebRtcTransportRequestorServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    CameraAvSettingsUserLevelManagementServer as BaseCameraAvSettingsUserLevelManagementServer
} from "../behaviors/camera-av-settings-user-level-management/CameraAvSettingsUserLevelManagementServer.js";
import {
    WebRtcTransportProviderBehavior as BaseWebRtcTransportProviderBehavior
} from "../behaviors/web-rtc-transport-provider/WebRtcTransportProviderBehavior.js";
import {
    WebRtcTransportRequestorBehavior as BaseWebRtcTransportRequestorBehavior
} from "../behaviors/web-rtc-transport-requestor/WebRtcTransportRequestorBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * An Intercom is a device which provides two-way on demand communication facilities between devices.
 *
 * Examples include but are not limited to:
 *
 *   - Room to room systems in a house
 *
 *   - Entry door to individual units in a multi-tenet building
 *
 * IntercomDevice requires CameraAvStreamManagement cluster but CameraAvStreamManagement is not added by default because
 * you must select the features your device supports. You can add manually using IntercomDevice.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 16.4
 */
export interface IntercomDevice extends Identity<typeof IntercomDeviceDefinition> {}

export namespace IntercomRequirements {
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
     * The WebRtcTransportRequestor cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WebRtcTransportRequestorServer} for convenience.
     */
    export const WebRtcTransportRequestorServer = BaseWebRtcTransportRequestorServer;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The CameraAvSettingsUserLevelManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link CameraAvSettingsUserLevelManagementServer} for
     * convenience.
     */
    export const CameraAvSettingsUserLevelManagementServer = BaseCameraAvSettingsUserLevelManagementServer;

    /**
     * The WebRtcTransportProvider cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WebRtcTransportProviderBehavior} for convenience.
     */
    export const WebRtcTransportProviderBehavior = BaseWebRtcTransportProviderBehavior;

    /**
     * The WebRtcTransportRequestor cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WebRtcTransportRequestorBehavior} for convenience.
     */
    export const WebRtcTransportRequestorBehavior = BaseWebRtcTransportRequestorBehavior;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            CameraAvStreamManagement: CameraAvStreamManagementServer,
            WebRtcTransportProvider: WebRtcTransportProviderServer,
            WebRtcTransportRequestor: WebRtcTransportRequestorServer
        },
        optional: {
            Identify: IdentifyServer,
            CameraAvSettingsUserLevelManagement: CameraAvSettingsUserLevelManagementServer
        }
    };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: {
            WebRtcTransportProvider: WebRtcTransportProviderBehavior,
            WebRtcTransportRequestor: WebRtcTransportRequestorBehavior
        }
    };
}

export const IntercomDeviceDefinition = MutableEndpoint({
    name: "Intercom",
    deviceType: 0x140,
    deviceRevision: 1,
    requirements: IntercomRequirements,
    behaviors: SupportedBehaviors(
        IntercomRequirements.server.mandatory.WebRtcTransportProvider,
        IntercomRequirements.server.mandatory.WebRtcTransportRequestor
    )
});

Object.freeze(IntercomDeviceDefinition);
export const IntercomDevice: IntercomDevice = IntercomDeviceDefinition;
