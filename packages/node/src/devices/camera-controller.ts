/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    WebRtcTransportRequestorServer as BaseWebRtcTransportRequestorServer
} from "../behaviors/web-rtc-transport-requestor/WebRtcTransportRequestorServer.js";
import {
    WebRtcTransportProviderClient as BaseWebRtcTransportProviderClient
} from "../behaviors/web-rtc-transport-provider/WebRtcTransportProviderClient.js";
import { IdentifyClient as BaseIdentifyClient } from "../behaviors/identify/IdentifyClient.js";
import { PowerSourceClient as BasePowerSourceClient } from "../behaviors/power-source/PowerSourceClient.js";
import {
    OccupancySensingClient as BaseOccupancySensingClient
} from "../behaviors/occupancy-sensing/OccupancySensingClient.js";
import { ZoneManagementClient as BaseZoneManagementClient } from "../behaviors/zone-management/ZoneManagementClient.js";
import {
    CameraAvStreamManagementClient as BaseCameraAvStreamManagementClient
} from "../behaviors/camera-av-stream-management/CameraAvStreamManagementClient.js";
import {
    CameraAvSettingsUserLevelManagementClient as BaseCameraAvSettingsUserLevelManagementClient
} from "../behaviors/camera-av-settings-user-level-management/CameraAvSettingsUserLevelManagementClient.js";
import {
    PushAvStreamTransportClient as BasePushAvStreamTransportClient
} from "../behaviors/push-av-stream-transport/PushAvStreamTransportClient.js";
import {
    TlsCertificateManagementClient as BaseTlsCertificateManagementClient
} from "../behaviors/tls-certificate-management/TlsCertificateManagementClient.js";
import {
    TlsClientManagementClient as BaseTlsClientManagementClient
} from "../behaviors/tls-client-management/TlsClientManagementClient.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Camera controller device is a device that provides interfaces for controlling and managing camera devices.
 *
 * @see {@link MatterSpecification.v16.Device} § 16.8
 */
export interface CameraControllerDevice extends Identity<typeof CameraControllerDeviceDefinition> {}

export namespace CameraControllerRequirements {
    /**
     * The WebRtcTransportRequestor cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WebRtcTransportRequestorServer} for convenience.
     */
    export const WebRtcTransportRequestorServer = BaseWebRtcTransportRequestorServer;

    /**
     * The WebRtcTransportProvider cluster is required by the Matter specification.
     *
     * We provide this alias to the default implementation {@link WebRtcTransportProviderClient} for convenience.
     */
    export const WebRtcTransportProviderClient = BaseWebRtcTransportProviderClient;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyClient} for convenience.
     */
    export const IdentifyClient = BaseIdentifyClient;

    /**
     * The PowerSource cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link PowerSourceClient} for convenience.
     */
    export const PowerSourceClient = BasePowerSourceClient;

    /**
     * The OccupancySensing cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OccupancySensingClient} for convenience.
     */
    export const OccupancySensingClient = BaseOccupancySensingClient;

    /**
     * The ZoneManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ZoneManagementClient} for convenience.
     */
    export const ZoneManagementClient = BaseZoneManagementClient;

    /**
     * The CameraAvStreamManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link CameraAvStreamManagementClient} for convenience.
     */
    export const CameraAvStreamManagementClient = BaseCameraAvStreamManagementClient;

    /**
     * The CameraAvSettingsUserLevelManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link CameraAvSettingsUserLevelManagementClient} for
     * convenience.
     */
    export const CameraAvSettingsUserLevelManagementClient = BaseCameraAvSettingsUserLevelManagementClient;

    /**
     * The PushAvStreamTransport cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link PushAvStreamTransportClient} for convenience.
     */
    export const PushAvStreamTransportClient = BasePushAvStreamTransportClient;

    /**
     * The TlsCertificateManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TlsCertificateManagementClient} for convenience.
     */
    export const TlsCertificateManagementClient = BaseTlsCertificateManagementClient;

    /**
     * The TlsClientManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TlsClientManagementClient} for convenience.
     */
    export const TlsClientManagementClient = BaseTlsClientManagementClient;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { WebRtcTransportRequestor: WebRtcTransportRequestorServer } };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { WebRtcTransportProvider: WebRtcTransportProviderClient },

        optional: {
            Identify: IdentifyClient,
            PowerSource: PowerSourceClient,
            OccupancySensing: OccupancySensingClient,
            ZoneManagement: ZoneManagementClient,
            CameraAvStreamManagement: CameraAvStreamManagementClient,
            CameraAvSettingsUserLevelManagement: CameraAvSettingsUserLevelManagementClient,
            PushAvStreamTransport: PushAvStreamTransportClient,
            TlsCertificateManagement: TlsCertificateManagementClient,
            TlsClientManagement: TlsClientManagementClient
        }
    };
}

export const CameraControllerDeviceDefinition = MutableEndpoint({
    name: "CameraController",
    deviceType: 0x147,
    deviceRevision: 1,
    requirements: CameraControllerRequirements,
    behaviors: SupportedBehaviors(CameraControllerRequirements.server.mandatory.WebRtcTransportRequestor)
});

Object.freeze(CameraControllerDeviceDefinition);
export const CameraControllerDevice: CameraControllerDevice = CameraControllerDeviceDefinition;
