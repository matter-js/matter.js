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
    WebRtcTransportProviderBehavior as BaseWebRtcTransportProviderBehavior
} from "../behaviors/web-rtc-transport-provider/WebRtcTransportProviderBehavior.js";
import { IdentifyBehavior as BaseIdentifyBehavior } from "../behaviors/identify/IdentifyBehavior.js";
import { PowerSourceBehavior as BasePowerSourceBehavior } from "../behaviors/power-source/PowerSourceBehavior.js";
import {
    OccupancySensingBehavior as BaseOccupancySensingBehavior
} from "../behaviors/occupancy-sensing/OccupancySensingBehavior.js";
import {
    ZoneManagementBehavior as BaseZoneManagementBehavior
} from "../behaviors/zone-management/ZoneManagementBehavior.js";
import {
    CameraAvStreamManagementBehavior as BaseCameraAvStreamManagementBehavior
} from "../behaviors/camera-av-stream-management/CameraAvStreamManagementBehavior.js";
import {
    CameraAvSettingsUserLevelManagementBehavior as BaseCameraAvSettingsUserLevelManagementBehavior
} from "../behaviors/camera-av-settings-user-level-management/CameraAvSettingsUserLevelManagementBehavior.js";
import {
    PushAvStreamTransportBehavior as BasePushAvStreamTransportBehavior
} from "../behaviors/push-av-stream-transport/PushAvStreamTransportBehavior.js";
import {
    TlsCertificateManagementBehavior as BaseTlsCertificateManagementBehavior
} from "../behaviors/tls-certificate-management/TlsCertificateManagementBehavior.js";
import {
    TlsClientManagementBehavior as BaseTlsClientManagementBehavior
} from "../behaviors/tls-client-management/TlsClientManagementBehavior.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Camera controller device is a device that provides interfaces for controlling and managing camera devices.
 *
 * @see {@link MatterSpecification.v151.Device} § 16.8
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
     * We provide this alias to the default implementation {@link WebRtcTransportProviderBehavior} for convenience.
     */
    export const WebRtcTransportProviderBehavior = BaseWebRtcTransportProviderBehavior;

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyBehavior} for convenience.
     */
    export const IdentifyBehavior = BaseIdentifyBehavior;

    /**
     * The PowerSource cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link PowerSourceBehavior} for convenience.
     */
    export const PowerSourceBehavior = BasePowerSourceBehavior;

    /**
     * The OccupancySensing cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OccupancySensingBehavior} for convenience.
     */
    export const OccupancySensingBehavior = BaseOccupancySensingBehavior;

    /**
     * The ZoneManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link ZoneManagementBehavior} for convenience.
     */
    export const ZoneManagementBehavior = BaseZoneManagementBehavior;

    /**
     * The CameraAvStreamManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link CameraAvStreamManagementBehavior} for convenience.
     */
    export const CameraAvStreamManagementBehavior = BaseCameraAvStreamManagementBehavior;

    /**
     * The CameraAvSettingsUserLevelManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link CameraAvSettingsUserLevelManagementBehavior} for
     * convenience.
     */
    export const CameraAvSettingsUserLevelManagementBehavior = BaseCameraAvSettingsUserLevelManagementBehavior;

    /**
     * The PushAvStreamTransport cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link PushAvStreamTransportBehavior} for convenience.
     */
    export const PushAvStreamTransportBehavior = BasePushAvStreamTransportBehavior;

    /**
     * The TlsCertificateManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TlsCertificateManagementBehavior} for convenience.
     */
    export const TlsCertificateManagementBehavior = BaseTlsCertificateManagementBehavior;

    /**
     * The TlsClientManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link TlsClientManagementBehavior} for convenience.
     */
    export const TlsClientManagementBehavior = BaseTlsClientManagementBehavior;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = { mandatory: { WebRtcTransportRequestor: WebRtcTransportRequestorServer } };

    /**
     * A definition for each client cluster supported by the endpoint per the Matter specification.
     */
    export const client = {
        mandatory: { WebRtcTransportProvider: WebRtcTransportProviderBehavior },

        optional: {
            Identify: IdentifyBehavior,
            PowerSource: PowerSourceBehavior,
            OccupancySensing: OccupancySensingBehavior,
            ZoneManagement: ZoneManagementBehavior,
            CameraAvStreamManagement: CameraAvStreamManagementBehavior,
            CameraAvSettingsUserLevelManagement: CameraAvSettingsUserLevelManagementBehavior,
            PushAvStreamTransport: PushAvStreamTransportBehavior,
            TlsCertificateManagement: TlsCertificateManagementBehavior,
            TlsClientManagement: TlsClientManagementBehavior
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
