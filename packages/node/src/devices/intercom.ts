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
    WebRtcTransportProviderClient as BaseWebRtcTransportProviderClient
} from "../behaviors/web-rtc-transport-provider/WebRtcTransportProviderClient.js";
import {
    WebRtcTransportRequestorClient as BaseWebRtcTransportRequestorClient
} from "../behaviors/web-rtc-transport-requestor/WebRtcTransportRequestorClient.js";
import { ChimeClient as BaseChimeClient } from "../behaviors/chime/ChimeClient.js";
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
 *   - Entry door to individual units in a multi-tenant building
 *
 * ### Device Type Requirements
 *
 * An Intercom shall be composed of at least one endpoint with the Generic Switch device type as defined by the
 * conformance below. There may be more endpoints with other device types existing in the Intercom. The Generic Switch
 * shall model the mechanism used by the Intercom to trigger an alert of the desired connected party.
 *
 * All devices used in compositions shall adhere to the disambiguation and superset requirements of the System Model.
 *
 * ### Cluster Requirements
 *
 * An Audio connection may be established with an instance of an Intercom in one of two ways:
 *
 *   - via WebRTC, with the Intercom acting as a WebRTC Transport Requestor Client.
 *
 *   - via WebRTC, with a Controller acting as the WebRTC Transport Requestor and the Intercom, in this instance, acting
 *     as a WebRTC Transport Provider Server. In this case, the Controller may trigger the establishment of Audio
 *     through knowledge that there is user intent via subscriptions to the attributes of the Generic Switch, or other
 *     means.
 *
 * @see {@link MatterSpecification.v16.Device} § 16.4
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
     * We provide this alias to the default implementation {@link WebRtcTransportProviderClient} for convenience.
     */
    export const WebRtcTransportProviderClient = BaseWebRtcTransportProviderClient;

    /**
     * The WebRtcTransportRequestor cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WebRtcTransportRequestorClient} for convenience.
     */
    export const WebRtcTransportRequestorClient = BaseWebRtcTransportRequestorClient;

    /**
     * The Chime cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ChimeClient} for convenience.
     */
    export const ChimeClient = BaseChimeClient;

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
            WebRtcTransportProvider: WebRtcTransportProviderClient,
            WebRtcTransportRequestor: WebRtcTransportRequestorClient
        },
        optional: { Chime: ChimeClient }
    };
}

export const IntercomDeviceDefinition = MutableEndpoint({
    name: "Intercom",
    deviceType: 0x140,
    deviceRevision: 2,
    requirements: IntercomRequirements,
    behaviors: SupportedBehaviors(
        IntercomRequirements.server.mandatory.CameraAvStreamManagement,
        IntercomRequirements.server.mandatory.WebRtcTransportProvider,
        IntercomRequirements.server.mandatory.WebRtcTransportRequestor
    )
});

Object.freeze(IntercomDeviceDefinition);
export const IntercomDevice: IntercomDevice = IntercomDeviceDefinition;
