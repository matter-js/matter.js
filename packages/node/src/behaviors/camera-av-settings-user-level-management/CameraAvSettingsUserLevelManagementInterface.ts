/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { CameraAvSettingsUserLevelManagement } from "@matter/types/clusters/camera-av-settings-user-level-management";

export namespace CameraAvSettingsUserLevelManagementInterface {
    export interface MechanicalPanOrMechanicalTiltOrMechanicalZoom {
        /**
         * This command shall move the camera to the provided values for pan, tilt, and zoom in the mechanical PTZ.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.1
         */
        mptzSetPosition(request: CameraAvSettingsUserLevelManagement.MptzSetPositionRequest): MaybePromise;

        /**
         * This command shall move the camera by the delta values relative to the currently defined position.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.2
         */
        mptzRelativeMove(request: CameraAvSettingsUserLevelManagement.MptzRelativeMoveRequest): MaybePromise;
    }

    export interface MechanicalPresets {
        /**
         * This command shall move the camera to the positions specified by the Preset passed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.3
         */
        mptzMoveToPreset(request: CameraAvSettingsUserLevelManagement.MptzMoveToPresetRequest): MaybePromise;

        /**
         * This command allows creating a new preset or updating the values of an existing one.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.4
         */
        mptzSavePreset(request: CameraAvSettingsUserLevelManagement.MptzSavePresetRequest): MaybePromise;

        /**
         * This command shall remove a preset entry from the PresetMptzTable.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.5
         */
        mptzRemovePreset(request: CameraAvSettingsUserLevelManagement.MptzRemovePresetRequest): MaybePromise;
    }

    export interface DigitalPtz {
        /**
         * This command allows for setting the digital viewport for a specific Video Stream. This command is a
         * per-stream version of the Viewport Attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.6
         */
        dptzSetViewport(request: CameraAvSettingsUserLevelManagement.DptzSetViewportRequest): MaybePromise;

        /**
         * This command shall change the per stream viewport by the amount specified in a relative fashion. This allows
         * for multiple users to interact with a directional arrow based user interface. It is recommended to increment
         * or decrement the values by 10% of the SensorWidth and SensorHeight found in VideoSensorParams.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.7
         */
        dptzRelativeMove(request: CameraAvSettingsUserLevelManagement.DptzRelativeMoveRequest): MaybePromise;
    }
}

export type CameraAvSettingsUserLevelManagementInterface = {
    components: [
        {
            flags: { mechanicalPan: true },
            methods: CameraAvSettingsUserLevelManagementInterface.MechanicalPanOrMechanicalTiltOrMechanicalZoom
        },
        {
            flags: { mechanicalTilt: true },
            methods: CameraAvSettingsUserLevelManagementInterface.MechanicalPanOrMechanicalTiltOrMechanicalZoom
        },
        {
            flags: { mechanicalZoom: true },
            methods: CameraAvSettingsUserLevelManagementInterface.MechanicalPanOrMechanicalTiltOrMechanicalZoom
        },
        { flags: { mechanicalPresets: true }, methods: CameraAvSettingsUserLevelManagementInterface.MechanicalPresets },
        { flags: { digitalPtz: true }, methods: CameraAvSettingsUserLevelManagementInterface.DigitalPtz }
    ]
};
