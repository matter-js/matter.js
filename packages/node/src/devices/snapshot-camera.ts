/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    CameraAvStreamManagementServer as BaseCameraAvStreamManagementServer
} from "../behaviors/camera-av-stream-management/CameraAvStreamManagementServer.js";
import { IdentifyServer as BaseIdentifyServer } from "../behaviors/identify/IdentifyServer.js";
import {
    OccupancySensingServer as BaseOccupancySensingServer
} from "../behaviors/occupancy-sensing/OccupancySensingServer.js";
import { ZoneManagementServer as BaseZoneManagementServer } from "../behaviors/zone-management/ZoneManagementServer.js";
import {
    CameraAvSettingsUserLevelManagementServer as BaseCameraAvSettingsUserLevelManagementServer
} from "../behaviors/camera-av-settings-user-level-management/CameraAvSettingsUserLevelManagementServer.js";
import { MutableEndpoint } from "../endpoint/type/MutableEndpoint.js";
import { SupportedBehaviors } from "../endpoint/properties/SupportedBehaviors.js";
import { Identity } from "@matter/general";

/**
 * A Snapshot Camera device is a camera which can only support retrieving still images on-demand via the Capture
 * Snapshot command in the Camera AV Stream Management cluster.
 *
 * SnapshotCameraDevice requires CameraAvStreamManagement cluster but CameraAvStreamManagement is not added by default
 * because you must select the features your device supports. You can add manually using SnapshotCameraDevice.with().
 *
 * @see {@link MatterSpecification.v142.Device} § 16.6
 */
export interface SnapshotCameraDevice extends Identity<typeof SnapshotCameraDeviceDefinition> {}

export namespace SnapshotCameraRequirements {
    /**
     * The CameraAvStreamManagement cluster is required by the Matter specification.
     *
     * This version of {@link CameraAvStreamManagementServer} is specialized per the specification.
     */
    export const CameraAvStreamManagementServer = BaseCameraAvStreamManagementServer.with("Snapshot");

    /**
     * The Identify cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link IdentifyServer} for convenience.
     */
    export const IdentifyServer = BaseIdentifyServer;

    /**
     * The OccupancySensing cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link OccupancySensingServer} for convenience.
     */
    export const OccupancySensingServer = BaseOccupancySensingServer;

    /**
     * The ZoneManagement cluster is optional per the Matter specification.
     *
     * This version of {@link ZoneManagementServer} is specialized per the specification.
     */
    export const ZoneManagementServer = BaseZoneManagementServer.with("TwoDimensionalCartesianZone");

    /**
     * The CameraAvSettingsUserLevelManagement cluster is optional per the Matter specification.
     *
     * We provide this alias to the default implementation {@link CameraAvSettingsUserLevelManagementServer} for
     * convenience.
     */
    export const CameraAvSettingsUserLevelManagementServer = BaseCameraAvSettingsUserLevelManagementServer;

    /**
     * An implementation for each server cluster supported by the endpoint per the Matter specification.
     */
    export const server = {
        mandatory: { CameraAvStreamManagement: CameraAvStreamManagementServer },

        optional: {
            Identify: IdentifyServer,
            OccupancySensing: OccupancySensingServer,
            ZoneManagement: ZoneManagementServer,
            CameraAvSettingsUserLevelManagement: CameraAvSettingsUserLevelManagementServer
        }
    };
}

export const SnapshotCameraDeviceDefinition = MutableEndpoint({
    name: "SnapshotCamera",
    deviceType: 0x145,
    deviceRevision: 1,
    requirements: SnapshotCameraRequirements,
    behaviors: SupportedBehaviors()
});

Object.freeze(SnapshotCameraDeviceDefinition);
export const SnapshotCameraDevice: SnapshotCameraDevice = SnapshotCameraDeviceDefinition;
