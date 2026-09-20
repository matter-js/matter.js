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
    WebRtcTransportRequestorClient as BaseWebRtcTransportRequestorClient
} from "../behaviors/web-rtc-transport-requestor/WebRtcTransportRequestorClient.js";
import {
    WebRtcTransportProviderClient as BaseWebRtcTransportProviderClient
} from "../behaviors/web-rtc-transport-provider/WebRtcTransportProviderClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Camera device is a camera that provides interfaces for controlling and transporting captured media, such as Audio,
 * Video or Snapshots.
 *
 * ### Device Type Requirements
 *
 * A Camera may expose elements of its functionality through one or more additional device types on different endpoints.
 * All devices used in compositions shall adhere to the disambiguation requirements of the System Model. Other device
 * types, not explicitly listed in the table, may also be included in device compositions but are not considered part of
 * the core functionality of the device.
 *
 * Cameras which implement occupancy detection based on the signals from the optical sensor, may expose this
 * functionality using an Occupancy Sensing cluster on the primary camera endpoint along with the other camera
 * functionality. The device type Occupancy Sensor shall NOT be added to the DeviceTypeList of this endpoint.
 *
 * Cameras may have an Occupancy Sensor of a different type for occupancy detection independent of the optical sensor.
 * If this sensor is exposed, it shall be placed on a child endpoint of the primary camera endpoint, with the
 * corresponding device type Occupancy Sensor, as indicated in the following table:
 *
 * @see {@link MatterSpecification.v16.Device} § 16.1
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
     * We provide this alias to the default implementation {@link WebRtcTransportRequestorClient} for convenience.
     */
    export const WebRtcTransportRequestorClient = BaseWebRtcTransportRequestorClient;

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
        mandatory: { WebRtcTransportRequestor: WebRtcTransportRequestorClient },
        optional: { WebRtcTransportProvider: WebRtcTransportProviderClient }
    };

    /**
     * The device types this device type requires of its child endpoints per the Matter specification.
     */
    export const deviceTypes = { optional: { OccupancySensor: { deviceType: 0x107 } } };

    /**
     * Conditions this device type's requirements are stated against, keyed by condition name, per the Matter
     *
     * specification.
     */
    export const conditions = {
        mandatory: {
            TlsCertificatesCond: { declaredBy: "RootNode" },
            PowerSourceCond: { declaredBy: "RootNode" },
            TimeSyncWithNtpcCond: { declaredBy: "RootNode" },
            TimeSyncWithClientCond: { declaredBy: "RootNode" },
            TimeSyncWithTzCond: { declaredBy: "RootNode" },
            TlsClientCond: { declaredBy: "RootNode" }
        }
    };
}

export const CameraDeviceDefinition = MutableEndpoint({
    name: "Camera",
    deviceType: 0x142,
    deviceRevision: 1,
    requirements: CameraRequirements,
    behaviors: SupportedBehaviors(
        CameraRequirements.server.mandatory.CameraAvStreamManagement,
        CameraRequirements.server.mandatory.WebRtcTransportProvider
    )
});

Object.freeze(CameraDeviceDefinition);
export const CameraDevice: CameraDevice = CameraDeviceDefinition;
