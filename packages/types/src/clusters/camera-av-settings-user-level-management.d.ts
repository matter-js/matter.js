/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { MaybePromise } from "@matter/general";
import type { Viewport } from "../globals/Viewport.js";

/**
 * Definitions for the CameraAvSettingsUserLevelManagement cluster.
 *
 * This cluster provides an interface into controls associated with the operation of a camera that provides pan, tilt,
 * and zoom functions, either mechanically, or against a digital image.
 *
 * @see {@link MatterSpecification.v142.Cluster} § 11.3
 */
export declare namespace CameraAvSettingsUserLevelManagement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0552;

    /**
     * Textual cluster identifier.
     */
    export const name: "CameraAvSettingsUserLevelManagement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the CameraAvSettingsUserLevelManagement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link CameraAvSettingsUserLevelManagement} supports these elements if it supports feature
     * "MechanicalPanOrMechanicalTiltOrMechanicalZoom".
     */
    export interface MechanicalPanOrMechanicalTiltOrMechanicalZoomAttributes {
        /**
         * This attribute indicates the currently selected mechanical pan, tilt, and zoom position.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.1
         */
        mptzPosition: Mptz;

        /**
         * Indicates the current movement state of the camera.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.10
         */
        movementState: PhysicalMovement;
    }

    /**
     * {@link CameraAvSettingsUserLevelManagement} supports these elements if it supports feature "MechanicalPresets".
     */
    export interface MechanicalPresetsAttributes {
        /**
         * This attribute indicates the maximum number of presets for the mechanical pan, tilt, zoom.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.2
         */
        maxPresets: number;

        /**
         * This attribute shall be a list of MPTZPresetStruct. Each entry in the list contains a preset for mechanical
         * pan, tilt, and/or zoom, the values for which are represented by an instance of an MPTZStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.3
         */
        mptzPresets: MptzPreset[];
    }

    /**
     * {@link CameraAvSettingsUserLevelManagement} supports these elements if it supports feature "DigitalPtz".
     */
    export interface DigitalPtzAttributes {
        /**
         * This attribute is a list of DPTZStruct. If a video stream is listed, it means digital movement is supported
         * via DPTZSetViewport or DPTZRelativeMove. The initial values for each Viewport entry shall be the values found
         * in the global Viewport.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.4
         */
        dptzStreams: Dptz[];
    }

    /**
     * {@link CameraAvSettingsUserLevelManagement} supports these elements if it supports feature "MechanicalZoom".
     */
    export interface MechanicalZoomAttributes {
        /**
         * Indicates the maximum value for the mechanical zoom specified by the camera manufacturer that allows for
         * increments of 1 to be noticeable. The handling of this value is implementation specific.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.5
         */
        zoomMax: number;
    }

    /**
     * {@link CameraAvSettingsUserLevelManagement} supports these elements if it supports feature "MechanicalTilt".
     */
    export interface MechanicalTiltAttributes {
        /**
         * Indicates the minimum value for the mechanical tilt specified by the camera manufacturer in angular degrees.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.6
         */
        tiltMin: number;

        /**
         * Indicates the maximum value for the mechanical tilt specified by the camera manufacturer in angular degrees.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.7
         */
        tiltMax: number;
    }

    /**
     * {@link CameraAvSettingsUserLevelManagement} supports these elements if it supports feature "MechanicalPan".
     */
    export interface MechanicalPanAttributes {
        /**
         * Indicates the minimum value for the mechanical pan specified by the camera manufacturer in angular degrees.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.8
         */
        panMin: number;

        /**
         * Indicates the maximum value for the mechanical pan specified by the camera manufacturer in angular degrees.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.9
         */
        panMax: number;
    }

    /**
     * Attributes that may appear in {@link CameraAvSettingsUserLevelManagement}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute indicates the currently selected mechanical pan, tilt, and zoom position.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.1
         */
        mptzPosition: Mptz;

        /**
         * Indicates the current movement state of the camera.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.10
         */
        movementState: PhysicalMovement;

        /**
         * This attribute indicates the maximum number of presets for the mechanical pan, tilt, zoom.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.2
         */
        maxPresets: number;

        /**
         * This attribute shall be a list of MPTZPresetStruct. Each entry in the list contains a preset for mechanical
         * pan, tilt, and/or zoom, the values for which are represented by an instance of an MPTZStruct.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.3
         */
        mptzPresets: MptzPreset[];

        /**
         * This attribute is a list of DPTZStruct. If a video stream is listed, it means digital movement is supported
         * via DPTZSetViewport or DPTZRelativeMove. The initial values for each Viewport entry shall be the values found
         * in the global Viewport.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.4
         */
        dptzStreams: Dptz[];

        /**
         * Indicates the maximum value for the mechanical zoom specified by the camera manufacturer that allows for
         * increments of 1 to be noticeable. The handling of this value is implementation specific.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.5
         */
        zoomMax: number;

        /**
         * Indicates the minimum value for the mechanical tilt specified by the camera manufacturer in angular degrees.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.6
         */
        tiltMin: number;

        /**
         * Indicates the maximum value for the mechanical tilt specified by the camera manufacturer in angular degrees.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.7
         */
        tiltMax: number;

        /**
         * Indicates the minimum value for the mechanical pan specified by the camera manufacturer in angular degrees.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.8
         */
        panMin: number;

        /**
         * Indicates the maximum value for the mechanical pan specified by the camera manufacturer in angular degrees.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.9
         */
        panMax: number;
    }

    /**
     * {@link CameraAvSettingsUserLevelManagement} supports these elements if it supports feature
     * "MechanicalPanOrMechanicalTiltOrMechanicalZoom".
     */
    export interface MechanicalPanOrMechanicalTiltOrMechanicalZoomCommands {
        /**
         * This command shall move the camera to the provided values for pan, tilt, and zoom in the mechanical PTZ.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.1
         */
        mptzSetPosition(request: MptzSetPositionRequest): MaybePromise;

        /**
         * This command shall move the camera by the delta values relative to the currently defined position.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.2
         */
        mptzRelativeMove(request: MptzRelativeMoveRequest): MaybePromise;
    }

    /**
     * {@link CameraAvSettingsUserLevelManagement} supports these elements if it supports feature "MechanicalPresets".
     */
    export interface MechanicalPresetsCommands {
        /**
         * This command shall move the camera to the positions specified by the Preset passed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.3
         */
        mptzMoveToPreset(request: MptzMoveToPresetRequest): MaybePromise;

        /**
         * This command allows creating a new preset or updating the values of an existing one.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.4
         */
        mptzSavePreset(request: MptzSavePresetRequest): MaybePromise;

        /**
         * This command shall remove a preset entry from the PresetMptzTable.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.5
         */
        mptzRemovePreset(request: MptzRemovePresetRequest): MaybePromise;
    }

    /**
     * {@link CameraAvSettingsUserLevelManagement} supports these elements if it supports feature "DigitalPtz".
     */
    export interface DigitalPtzCommands {
        /**
         * This command allows for setting the digital viewport for a specific Video Stream. This command is a
         * per-stream version of the Viewport Attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.6
         */
        dptzSetViewport(request: DptzSetViewportRequest): MaybePromise;

        /**
         * This command shall change the per stream viewport by the amount specified in a relative fashion. This allows
         * for multiple users to interact with a directional arrow based user interface. It is recommended to increment
         * or decrement the values by 10% of the SensorWidth and SensorHeight found in VideoSensorParams.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.7
         */
        dptzRelativeMove(request: DptzRelativeMoveRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link CameraAvSettingsUserLevelManagement}.
     */
    export interface Commands extends
        MechanicalPanOrMechanicalTiltOrMechanicalZoomCommands,
        MechanicalPresetsCommands,
        DigitalPtzCommands
    {}

    export type Components = [
        {
            flags: { mechanicalPan: true },
            attributes: MechanicalPanOrMechanicalTiltOrMechanicalZoomAttributes,
            commands: MechanicalPanOrMechanicalTiltOrMechanicalZoomCommands
        },
        {
            flags: { mechanicalTilt: true },
            attributes: MechanicalPanOrMechanicalTiltOrMechanicalZoomAttributes,
            commands: MechanicalPanOrMechanicalTiltOrMechanicalZoomCommands
        },
        {
            flags: { mechanicalZoom: true },
            attributes: MechanicalPanOrMechanicalTiltOrMechanicalZoomAttributes,
            commands: MechanicalPanOrMechanicalTiltOrMechanicalZoomCommands
        },
        {
            flags: { mechanicalPresets: true },
            attributes: MechanicalPresetsAttributes,
            commands: MechanicalPresetsCommands
        },
        { flags: { digitalPtz: true }, attributes: DigitalPtzAttributes, commands: DigitalPtzCommands },
        { flags: { mechanicalZoom: true }, attributes: MechanicalZoomAttributes },
        { flags: { mechanicalTilt: true }, attributes: MechanicalTiltAttributes },
        { flags: { mechanicalPan: true }, attributes: MechanicalPanAttributes }
    ];

    export type Features = "DigitalPtz" | "MechanicalPan" | "MechanicalTilt" | "MechanicalZoom" | "MechanicalPresets";

    /**
     * These are optional features supported by CameraAvSettingsUserLevelManagementCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.4
     */
    export enum Feature {
        /**
         * DigitalPtz (DPTZ)
         *
         * This feature indicates that per video stream digital pan, tilt, and zoom is supported.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.4.1
         */
        DigitalPtz = "DigitalPtz",

        /**
         * MechanicalPan (MPAN)
         *
         * This feature indicates that mechanical pan is supported on the camera.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.4.2
         */
        MechanicalPan = "MechanicalPan",

        /**
         * MechanicalTilt (MTILT)
         *
         * This feature indicates that mechanical tilt is supported on the camera.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.4.3
         */
        MechanicalTilt = "MechanicalTilt",

        /**
         * MechanicalZoom (MZOOM)
         *
         * This feature indicates that mechanical zoom is supported on the camera.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.4.4
         */
        MechanicalZoom = "MechanicalZoom",

        /**
         * MechanicalPresets (MPRESETS)
         *
         * This feature indicates that the storage of presets is supported on the camera.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.4.5
         */
        MechanicalPresets = "MechanicalPresets"
    }

    /**
     * This type is used to indicate the mechanical pan, tilt, and zoom values.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.3
     */
    export interface Mptz {
        /**
         * This field shall indicate the mechanical pan value in angular degrees of angle. A zero value shall indicate
         * the home position horizontal reference for the direction of view of the camera. A negative value shall
         * indicate a leftward rotation of the camera about the vertical axis of the camera coordinate system. A
         * positive value shall indicate a rightward rotation of the camera about the vertical axis of the camera
         * coordinate system.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.3.1
         */
        pan?: number;

        /**
         * This field shall indicate the mechanical tilt value in angular degrees of angle. A zero value shall indicate
         * a vertical reference for the direction of view of the camera. A negative value shall indicate a downward
         * rotation of the camera about the horizontal axis of the camera coordinate system. A positive value shall
         * indicate an upward rotation of the camera about the horizontal axis of the camera coordinate system.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.3.2
         */
        tilt?: number;

        /**
         * This field shall indicate the zoom value to use. A value of 1 shall indicate the widest possible optical
         * field of view. A value of ZoomMax shall indicate the narrowest possible field of optical view.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.3.3
         */
        zoom?: number;
    }

    /**
     * The PhysicalMovementEnum provides an enumeration of the possible physical movement states in which the camera
     * could be.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.1
     */
    export enum PhysicalMovement {
        /**
         * The camera is idle.
         *
         * The camera is idle, there is no movement active.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.1.1
         */
        Idle = 0,

        /**
         * The camera is moving to a new value of Pan, Tilt, and/or Zoom.
         *
         * The camera is moving to a new value of Pan, Tilt, and/or Zoom as a result of the reception of a command that
         * changes one or more of these values.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.1.2
         */
        Moving = 1
    }

    /**
     * This type is used to save a preset location for mechanical pan, tilt and zoom.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.4
     */
    export interface MptzPreset {
        /**
         * This shall be derived from uint8 and represents the ID for a saved set of preset values for mechanical pan,
         * tilt and zoom.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.4.1
         */
        presetId: number;

        /**
         * The shall be a string representing the name of the Preset.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.4.2
         */
        name: string;

        /**
         * This shall hold the mechanical pan, tilt and zoom values.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.4.3
         */
        settings: Mptz;
    }

    /**
     * This type is used to indicate support for the per stream digital pan, tilt, and zoom values.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.2
     */
    export interface Dptz {
        /**
         * This field shall indicate the video stream this applies too.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.2.1
         */
        videoStreamId: number;

        /**
         * This field shall indicate the per stream viewport applied to this video stream. See Viewport for details on
         * the coordinate system.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.2.2
         */
        viewport: Viewport;
    }

    /**
     * This command shall move the camera to the provided values for pan, tilt, and zoom in the mechanical PTZ.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.1
     */
    export interface MptzSetPositionRequest {
        /**
         * This field shall indicate the absolute pan value in angular degrees.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.1.1
         */
        pan?: number;

        /**
         * This field shall indicate the absolute tilt value in angular degrees.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.1.2
         */
        tilt?: number;

        /**
         * This field shall indicate the absolute zoom value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.1.3
         */
        zoom?: number;
    }

    /**
     * This command shall move the camera by the delta values relative to the currently defined position.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.2
     */
    export interface MptzRelativeMoveRequest {
        /**
         * This field shall indicate the change in the pan value in degrees relative to the current location. A value of
         * 0 means no movement. A negative value means move left. A positive value means move right.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.2.1
         */
        panDelta?: number;

        /**
         * This field shall indicate the change in the tilt value in degrees relative to the current location. A value
         * of 0 means no movement. A negative value means move down. A positive value means move up.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.2.2
         */
        tiltDelta?: number;

        /**
         * This field shall indicate the percentage change in the zoom value relative to the current zoom value on the
         * camera. A value of 0 means no change. A negative value means zoom out. A positive value means zoom in.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.2.3
         */
        zoomDelta?: number;
    }

    /**
     * This command shall move the camera to the positions specified by the Preset passed.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.3
     */
    export interface MptzMoveToPresetRequest {
        /**
         * This field shall match the PresetID of an entry in MptzPresets.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.3.1
         */
        presetId: number;
    }

    /**
     * This command allows creating a new preset or updating the values of an existing one.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.4
     */
    export interface MptzSavePresetRequest {
        /**
         * This field shall indicate the ID of an entry in MptzPresets.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.4.1
         */
        presetId?: number;

        name: string;
    }

    /**
     * This command shall remove a preset entry from the PresetMptzTable.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.5
     */
    export interface MptzRemovePresetRequest {
        /**
         * This field shall indicate the ID of an entry in MptzPresets.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.5.1
         */
        presetId: number;
    }

    /**
     * This command allows for setting the digital viewport for a specific Video Stream. This command is a per-stream
     * version of the Viewport Attribute.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.6
     */
    export interface DptzSetViewportRequest {
        /**
         * This field shall be a VideoStreamIDType representing the video stream to modify.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.6.1
         */
        videoStreamId: number;

        /**
         * This field shall be a ViewportStruct representing the new viewport to apply to the requested stream. The
         * aspect ratio of the viewport shall match the aspect ratio of the stream requested.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.6.2
         */
        viewport: Viewport;
    }

    /**
     * This command shall change the per stream viewport by the amount specified in a relative fashion. This allows for
     * multiple users to interact with a directional arrow based user interface. It is recommended to increment or
     * decrement the values by 10% of the SensorWidth and SensorHeight found in VideoSensorParams.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.7
     */
    export interface DptzRelativeMoveRequest {
        /**
         * This field shall be a VideoStreamIDType representing the video stream to modify.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.7.1
         */
        videoStreamId: number;

        /**
         * This field shall represent the number of pixels to move the Viewport on the X axis within the SensorWidth and
         * SensorHeight found in VideoSensorParams. A value of 0 means no movement. A negative value means move the
         * viewport left. A positive value means move the viewport right.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.7.2
         */
        deltaX?: number;

        /**
         * This field shall represent the number of pixels to move the Viewport on the Y axis within the SensorWidth and
         * SensorHeight found in VideoSensorParams. A value of 0 means no movement. A negative value means move the
         * viewport down. A positive value means move the viewport up.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.7.3
         */
        deltaY?: number;

        /**
         * This field shall represent a percentage change to the size of the Viewport is within the SensorWidth and
         * SensorHeight found in VideoSensorParams. A value of 0 means no change. A negative value means make the
         * viewport larger. A positive value means make the viewport smaller.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.7.4
         */
        zoomDelta?: number;
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link CameraAvSettingsUserLevelManagement}.
     */
    export const Cluster: typeof CameraAvSettingsUserLevelManagement;

    /**
     * @deprecated Use {@link CameraAvSettingsUserLevelManagement}.
     */
    export const Complete: typeof CameraAvSettingsUserLevelManagement;

    export const Typing: CameraAvSettingsUserLevelManagement;
}

/**
 * @deprecated Use {@link CameraAvSettingsUserLevelManagement}.
 */
export declare const CameraAvSettingsUserLevelManagementCluster: typeof CameraAvSettingsUserLevelManagement;

export interface CameraAvSettingsUserLevelManagement extends ClusterTyping {
    Attributes: CameraAvSettingsUserLevelManagement.Attributes;
    Commands: CameraAvSettingsUserLevelManagement.Commands;
    Features: CameraAvSettingsUserLevelManagement.Features;
    Components: CameraAvSettingsUserLevelManagement.Components;
}
