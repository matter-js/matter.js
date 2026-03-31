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
import {
    PushAvStreamTransportServer as BasePushAvStreamTransportServer
} from "../behaviors/push-av-stream-transport/PushAvStreamTransportServer.js";
import {
    CameraAvSettingsUserLevelManagementServer as BaseCameraAvSettingsUserLevelManagementServer
} from "../behaviors/camera-av-settings-user-level-management/CameraAvSettingsUserLevelManagementServer.js";
import { ZoneManagementServer as BaseZoneManagementServer } from "../behaviors/zone-management/ZoneManagementServer.js";
import {
    OccupancySensingServer as BaseOccupancySensingServer
} from "../behaviors/occupancy-sensing/OccupancySensingServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    WebRtcTransportRequestorBehavior as BaseWebRtcTransportRequestorBehavior
} from "../behaviors/web-rtc-transport-requestor/WebRtcTransportRequestorBehavior.js";
import {
    WebRtcTransportProviderBehavior as BaseWebRtcTransportProviderBehavior
} from "../behaviors/web-rtc-transport-provider/WebRtcTransportProviderBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Camera device is a camera that provides interfaces for controlling and transporting captured media, such as Audio,
 * Video or Snapshots.
 *
 * CameraDevice requires CameraAvStreamManagement cluster but CameraAvStreamManagement is not added by default because
 * you must select the features your device supports. You can add manually using CameraDevice.with().
 *
 * @see {@link MatterSpecification.v151.Device} § 16.1
 */
export interface CameraDevice extends Identity<typeof CameraDeviceDefinition> {}

export namespace CameraRequirements {
    /**
     * The CameraAvStreamManagement cluster is required by the Matter specification.
     *
     * This version of {@link CameraAvStreamManagementServer} is specialized per the specification.
     */
    export const CameraAvStreamManagementServer = BaseCameraAvStreamManagementServer.with("Video", "Audio", "Snapshot");

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
     * The CameraAvSettingsUserLevelManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link CameraAvSettingsUserLevelManagementServer} for
     * convenience.
     */
    export const CameraAvSettingsUserLevelManagementServer = BaseCameraAvSettingsUserLevelManagementServer;

    /**
     * The ZoneManagement cluster is optional per the Matter specification.
     *
     * This version of {@link ZoneManagementServer} is specialized per the specification.
     */
    export const ZoneManagementServer = BaseZoneManagementServer.with("TwoDimensionalCartesianZone");

    /**
     * The OccupancySensing cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OccupancySensingServer} for convenience.
     */
    export const OccupancySensingServer = BaseOccupancySensingServer;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The WebRtcTransportRequestor cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WebRtcTransportRequestorBehavior} for convenience.
     */
    export const WebRtcTransportRequestorBehavior = BaseWebRtcTransportRequestorBehavior;

    /**
     * The WebRtcTransportProvider cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link WebRtcTransportProviderBehavior} for convenience.
     */
    export const WebRtcTransportProviderBehavior = BaseWebRtcTransportProviderBehavior;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: {
            CameraAvStreamManagement: CameraAvStreamManagementServer,
            WebRtcTransportProvider: WebRtcTransportProviderServer
        },

        optional: {
            WebRtcTransportRequestor: WebRtcTransportRequestorServer,
            PushAvStreamTransport: PushAvStreamTransportServer,
            CameraAvSettingsUserLevelManagement: CameraAvSettingsUserLevelManagementServer,
            ZoneManagement: ZoneManagementServer,
            OccupancySensing: OccupancySensingServer,
            Identify: IdentifyServer
        }
    };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { WebRtcTransportRequestor: WebRtcTransportRequestorBehavior },
        optional: { WebRtcTransportProvider: WebRtcTransportProviderBehavior }
    };
}

export const CameraDeviceDefinition = MutableEndpoint({
    name: "Camera",
    deviceType: 0x142,
    deviceRevision: 1,
    requirements: CameraRequirements,
    behaviors: SupportedBehaviors(CameraRequirements.server.mandatory.WebRtcTransportProvider)
});

Object.freeze(CameraDeviceDefinition);
export const CameraDevice: CameraDevice = CameraDeviceDefinition;
