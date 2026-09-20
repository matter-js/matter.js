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
 * ### Device Type Requirements
 *
 * A Snapshot Camera may expose elements of its functionality through one or more additional device types on different
 * endpoints. All devices used in compositions shall adhere to the disambiguation requirements of the System Model.
 * Other device types, not explicitly listed in the table, may also be included in device compositions but are not
 * considered part of the core functionality of the device.
 *
 * Snapshot Cameras which implement occupancy detection based on the signals from the optical sensor, may expose this
 * functionality using an Occupancy Sensing cluster on the primary camera endpoint along with the other camera
 * functionality. The device type Occupancy Sensor shall NOT be added to the DeviceTypeList of this endpoint.
 *
 * Snapshot Cameras may have an Occupancy Sensor of a different type for occupancy detection independent of the optical
 * sensor. If this sensor is exposed, it shall be placed on a child endpoint of the primary camera endpoint, with the
 * corresponding device type Occupancy Sensor, as indicated in the following table:
 *
 * @see {@link MatterSpecification.v16.Device} § 16.6
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
        mandatory: { PowerSourceCond: { declaredBy: "RootNode" }, TimeSyncWithTzCond: { declaredBy: "RootNode" } }
    };
}

export const SnapshotCameraDeviceDefinition = MutableEndpoint({
    name: "SnapshotCamera",
    deviceType: 0x145,
    deviceRevision: 1,
    requirements: SnapshotCameraRequirements,
    behaviors: SupportedBehaviors(SnapshotCameraRequirements.server.mandatory.CameraAvStreamManagement)
});

Object.freeze(SnapshotCameraDeviceDefinition);
export const SnapshotCameraDevice: SnapshotCameraDevice = SnapshotCameraDeviceDefinition;
