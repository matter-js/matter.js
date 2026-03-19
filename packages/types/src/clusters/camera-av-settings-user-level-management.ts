/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, Command, TlvNoResponse, FixedAttribute, OptionalCommand } from "../cluster/Cluster.js";
import { TlvOptionalField, TlvObject, TlvField } from "../tlv/TlvObject.js";
import { TlvInt16, TlvUInt8, TlvEnum, TlvInt8, TlvUInt16 } from "../tlv/TlvNumber.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvString } from "../tlv/TlvString.js";
import { TlvViewport } from "../globals/Viewport.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace CameraAvSettingsUserLevelManagement {
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
    export const TlvMptz = TlvObject({
        /**
         * This field shall indicate the mechanical pan value in angular degrees of angle. A zero value shall indicate
         * the home position horizontal reference for the direction of view of the camera. A negative value shall
         * indicate a leftward rotation of the camera about the vertical axis of the camera coordinate system. A
         * positive value shall indicate a rightward rotation of the camera about the vertical axis of the camera
         * coordinate system.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.3.1
         */
        pan: TlvOptionalField(0, TlvInt16),

        /**
         * This field shall indicate the mechanical tilt value in angular degrees of angle. A zero value shall indicate
         * a vertical reference for the direction of view of the camera. A negative value shall indicate a downward
         * rotation of the camera about the horizontal axis of the camera coordinate system. A positive value shall
         * indicate an upward rotation of the camera about the horizontal axis of the camera coordinate system.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.3.2
         */
        tilt: TlvOptionalField(1, TlvInt16),

        /**
         * This field shall indicate the zoom value to use. A value of 1 shall indicate the widest possible optical
         * field of view. A value of ZoomMax shall indicate the narrowest possible field of optical view.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.3.3
         */
        zoom: TlvOptionalField(2, TlvUInt8.bound({ min: 1 }))
    });

    /**
     * This type is used to indicate the mechanical pan, tilt, and zoom values.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.3
     */
    export interface Mptz extends TypeFromSchema<typeof TlvMptz> {}

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
     * Input to the CameraAvSettingsUserLevelManagement mptzSetPosition command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.1
     */
    export const TlvMptzSetPositionRequest = TlvObject({
        /**
         * This field shall indicate the absolute pan value in angular degrees.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.1.1
         */
        pan: TlvOptionalField(0, TlvInt16),

        /**
         * This field shall indicate the absolute tilt value in angular degrees.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.1.2
         */
        tilt: TlvOptionalField(1, TlvInt16),

        /**
         * This field shall indicate the absolute zoom value.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.1.3
         */
        zoom: TlvOptionalField(2, TlvUInt8.bound({ min: 1 }))
    });

    /**
     * Input to the CameraAvSettingsUserLevelManagement mptzSetPosition command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.1
     */
    export interface MptzSetPositionRequest extends TypeFromSchema<typeof TlvMptzSetPositionRequest> {}

    /**
     * Input to the CameraAvSettingsUserLevelManagement mptzRelativeMove command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.2
     */
    export const TlvMptzRelativeMoveRequest = TlvObject({
        /**
         * This field shall indicate the change in the pan value in degrees relative to the current location. A value of
         * 0 means no movement. A negative value means move left. A positive value means move right.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.2.1
         */
        panDelta: TlvOptionalField(0, TlvInt16),

        /**
         * This field shall indicate the change in the tilt value in degrees relative to the current location. A value
         * of 0 means no movement. A negative value means move down. A positive value means move up.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.2.2
         */
        tiltDelta: TlvOptionalField(1, TlvInt16),

        /**
         * This field shall indicate the percentage change in the zoom value relative to the current zoom value on the
         * camera. A value of 0 means no change. A negative value means zoom out. A positive value means zoom in.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.2.3
         */
        zoomDelta: TlvOptionalField(2, TlvInt8)
    });

    /**
     * Input to the CameraAvSettingsUserLevelManagement mptzRelativeMove command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.2
     */
    export interface MptzRelativeMoveRequest extends TypeFromSchema<typeof TlvMptzRelativeMoveRequest> {}

    /**
     * This type is used to save a preset location for mechanical pan, tilt and zoom.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.4
     */
    export const TlvMptzPreset = TlvObject({
        /**
         * This shall be derived from uint8 and represents the ID for a saved set of preset values for mechanical pan,
         * tilt and zoom.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.4.1
         */
        presetId: TlvField(0, TlvUInt8.bound({ min: 1 })),

        /**
         * The shall be a string representing the name of the Preset.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.4.2
         */
        name: TlvField(1, TlvString.bound({ maxLength: 32 })),

        /**
         * This shall hold the mechanical pan, tilt and zoom values.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.4.3
         */
        settings: TlvField(2, TlvMptz)
    });

    /**
     * This type is used to save a preset location for mechanical pan, tilt and zoom.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.4
     */
    export interface MptzPreset extends TypeFromSchema<typeof TlvMptzPreset> {}

    /**
     * Input to the CameraAvSettingsUserLevelManagement mptzMoveToPreset command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.3
     */
    export const TlvMptzMoveToPresetRequest = TlvObject({
        /**
         * This field shall match the PresetID of an entry in MptzPresets.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.3.1
         */
        presetId: TlvField(0, TlvUInt8.bound({ min: 1 }))
    });

    /**
     * Input to the CameraAvSettingsUserLevelManagement mptzMoveToPreset command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.3
     */
    export interface MptzMoveToPresetRequest extends TypeFromSchema<typeof TlvMptzMoveToPresetRequest> {}

    /**
     * Input to the CameraAvSettingsUserLevelManagement mptzSavePreset command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.4
     */
    export const TlvMptzSavePresetRequest = TlvObject({
        /**
         * This field shall indicate the ID of an entry in MptzPresets.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.4.1
         */
        presetId: TlvOptionalField(0, TlvUInt8.bound({ min: 1 })),

        name: TlvField(1, TlvString.bound({ maxLength: 32 }))
    });

    /**
     * Input to the CameraAvSettingsUserLevelManagement mptzSavePreset command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.4
     */
    export interface MptzSavePresetRequest extends TypeFromSchema<typeof TlvMptzSavePresetRequest> {}

    /**
     * Input to the CameraAvSettingsUserLevelManagement mptzRemovePreset command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.5
     */
    export const TlvMptzRemovePresetRequest = TlvObject({
        /**
         * This field shall indicate the ID of an entry in MptzPresets.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.5.1
         */
        presetId: TlvField(0, TlvUInt8.bound({ min: 1 }))
    });

    /**
     * Input to the CameraAvSettingsUserLevelManagement mptzRemovePreset command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.5
     */
    export interface MptzRemovePresetRequest extends TypeFromSchema<typeof TlvMptzRemovePresetRequest> {}

    /**
     * This type is used to indicate support for the per stream digital pan, tilt, and zoom values.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.2
     */
    export const TlvDptz = TlvObject({
        /**
         * This field shall indicate the video stream this applies too.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.2.1
         */
        videoStreamId: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate the per stream viewport applied to this video stream. See Viewport for details on
         * the coordinate system.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.2.2
         */
        viewport: TlvField(1, TlvViewport)
    });

    /**
     * This type is used to indicate support for the per stream digital pan, tilt, and zoom values.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.5.2
     */
    export interface Dptz extends TypeFromSchema<typeof TlvDptz> {}

    /**
     * Input to the CameraAvSettingsUserLevelManagement dptzSetViewport command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.6
     */
    export const TlvDptzSetViewportRequest = TlvObject({
        /**
         * This field shall be a VideoStreamIDType representing the video stream to modify.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.6.1
         */
        videoStreamId: TlvField(0, TlvUInt16),

        /**
         * This field shall be a ViewportStruct representing the new viewport to apply to the requested stream. The
         * aspect ratio of the viewport shall match the aspect ratio of the stream requested.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.6.2
         */
        viewport: TlvField(1, TlvViewport)
    });

    /**
     * Input to the CameraAvSettingsUserLevelManagement dptzSetViewport command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.6
     */
    export interface DptzSetViewportRequest extends TypeFromSchema<typeof TlvDptzSetViewportRequest> {}

    /**
     * Input to the CameraAvSettingsUserLevelManagement dptzRelativeMove command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.7
     */
    export const TlvDptzRelativeMoveRequest = TlvObject({
        /**
         * This field shall be a VideoStreamIDType representing the video stream to modify.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.7.1
         */
        videoStreamId: TlvField(0, TlvUInt16),

        /**
         * This field shall represent the number of pixels to move the Viewport on the X axis within the SensorWidth and
         * SensorHeight found in VideoSensorParams. A value of 0 means no movement. A negative value means move the
         * viewport left. A positive value means move the viewport right.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.7.2
         */
        deltaX: TlvOptionalField(1, TlvInt16),

        /**
         * This field shall represent the number of pixels to move the Viewport on the Y axis within the SensorWidth and
         * SensorHeight found in VideoSensorParams. A value of 0 means no movement. A negative value means move the
         * viewport down. A positive value means move the viewport up.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.7.3
         */
        deltaY: TlvOptionalField(2, TlvInt16),

        /**
         * This field shall represent a percentage change to the size of the Viewport is within the SensorWidth and
         * SensorHeight found in VideoSensorParams. A value of 0 means no change. A negative value means make the
         * viewport larger. A positive value means make the viewport smaller.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.7.4
         */
        zoomDelta: TlvOptionalField(3, TlvInt8.bound({ min: -100, max: 100 }))
    });

    /**
     * Input to the CameraAvSettingsUserLevelManagement dptzRelativeMove command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.7
     */
    export interface DptzRelativeMoveRequest extends TypeFromSchema<typeof TlvDptzRelativeMoveRequest> {}

    /**
     * A CameraAvSettingsUserLevelManagementCluster supports these elements if it supports features MechanicalPan,
     * MechanicalTilt or MechanicalZoom.
     */
    export const MechanicalPanOrMechanicalTiltOrMechanicalZoomComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute indicates the currently selected mechanical pan, tilt, and zoom position.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.1
             */
            mptzPosition: Attribute(0x0, TlvMptz, { persistent: true }),

            /**
             * Indicates the current movement state of the camera.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.10
             */
            movementState: Attribute(0x9, TlvEnum<PhysicalMovement>())
        },

        commands: {
            /**
             * This command shall move the camera to the provided values for pan, tilt, and zoom in the mechanical PTZ.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.1
             */
            mptzSetPosition: Command(0x0, TlvMptzSetPositionRequest, 0x0, TlvNoResponse),

            /**
             * This command shall move the camera by the delta values relative to the currently defined position.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.2
             */
            mptzRelativeMove: Command(0x1, TlvMptzRelativeMoveRequest, 0x1, TlvNoResponse)
        }
    });

    /**
     * A CameraAvSettingsUserLevelManagementCluster supports these elements if it supports feature MechanicalPresets.
     */
    export const MechanicalPresetsComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute indicates the maximum number of presets for the mechanical pan, tilt, zoom.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.2
             */
            maxPresets: FixedAttribute(0x1, TlvUInt8),

            /**
             * This attribute shall be a list of MPTZPresetStruct. Each entry in the list contains a preset for
             * mechanical pan, tilt, and/or zoom, the values for which are represented by an instance of an MPTZStruct.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.3
             */
            mptzPresets: Attribute(0x2, TlvArray(TlvMptzPreset), { persistent: true, default: [] })
        },

        commands: {
            /**
             * This command shall move the camera to the positions specified by the Preset passed.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.3
             */
            mptzMoveToPreset: Command(0x2, TlvMptzMoveToPresetRequest, 0x2, TlvNoResponse),

            /**
             * This command allows creating a new preset or updating the values of an existing one.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.4
             */
            mptzSavePreset: Command(0x3, TlvMptzSavePresetRequest, 0x3, TlvNoResponse),

            /**
             * This command shall remove a preset entry from the PresetMptzTable.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.5
             */
            mptzRemovePreset: Command(0x4, TlvMptzRemovePresetRequest, 0x4, TlvNoResponse)
        }
    });

    /**
     * A CameraAvSettingsUserLevelManagementCluster supports these elements if it supports feature DigitalPtz.
     */
    export const DigitalPtzComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute is a list of DPTZStruct. If a video stream is listed, it means digital movement is
             * supported via DPTZSetViewport or DPTZRelativeMove. The initial values for each Viewport entry shall be
             * the values found in the global Viewport.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.4
             */
            dptzStreams: Attribute(0x3, TlvArray(TlvDptz), { persistent: true, default: [] })
        },

        commands: {
            /**
             * This command allows for setting the digital viewport for a specific Video Stream. This command is a
             * per-stream version of the Viewport Attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.6
             */
            dptzSetViewport: Command(0x5, TlvDptzSetViewportRequest, 0x5, TlvNoResponse),

            /**
             * This command shall change the per stream viewport by the amount specified in a relative fashion. This
             * allows for multiple users to interact with a directional arrow based user interface. It is recommended to
             * increment or decrement the values by 10% of the SensorWidth and SensorHeight found in VideoSensorParams.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.7.7
             */
            dptzRelativeMove: OptionalCommand(0x6, TlvDptzRelativeMoveRequest, 0x6, TlvNoResponse)
        }
    });

    /**
     * A CameraAvSettingsUserLevelManagementCluster supports these elements if it supports feature MechanicalZoom.
     */
    export const MechanicalZoomComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the maximum value for the mechanical zoom specified by the camera manufacturer that allows for
             * increments of 1 to be noticeable. The handling of this value is implementation specific.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.5
             */
            zoomMax: Attribute(0x4, TlvUInt8.bound({ min: 2, max: 100 }))
        }
    });

    /**
     * A CameraAvSettingsUserLevelManagementCluster supports these elements if it supports feature MechanicalTilt.
     */
    export const MechanicalTiltComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the minimum value for the mechanical tilt specified by the camera manufacturer in angular
             * degrees.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.6
             */
            tiltMin: Attribute(0x5, TlvInt16.bound({ min: -180, max: 179 })),

            /**
             * Indicates the maximum value for the mechanical tilt specified by the camera manufacturer in angular
             * degrees.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.7
             */
            tiltMax: Attribute(0x6, TlvInt16.bound({ min: -179, max: 180 }))
        }
    });

    /**
     * A CameraAvSettingsUserLevelManagementCluster supports these elements if it supports feature MechanicalPan.
     */
    export const MechanicalPanComponent = MutableCluster.Component({
        attributes: {
            /**
             * Indicates the minimum value for the mechanical pan specified by the camera manufacturer in angular
             * degrees.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.8
             */
            panMin: Attribute(0x7, TlvInt16.bound({ min: -180, max: 179 })),

            /**
             * Indicates the maximum value for the mechanical pan specified by the camera manufacturer in angular
             * degrees.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.6.9
             */
            panMax: Attribute(0x8, TlvInt16.bound({ min: -179, max: 180 }))
        }
    });

    /**
     * These elements and properties are present in all CameraAvSettingsUserLevelManagement clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x552,
        name: "CameraAvSettingsUserLevelManagement",
        revision: 1,

        features: {
            /**
             * This feature indicates that per video stream digital pan, tilt, and zoom is supported.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.4.1
             */
            digitalPtz: BitFlag(0),

            /**
             * This feature indicates that mechanical pan is supported on the camera.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.4.2
             */
            mechanicalPan: BitFlag(1),

            /**
             * This feature indicates that mechanical tilt is supported on the camera.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.4.3
             */
            mechanicalTilt: BitFlag(2),

            /**
             * This feature indicates that mechanical zoom is supported on the camera.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.4.4
             */
            mechanicalZoom: BitFlag(3),

            /**
             * This feature indicates that the storage of presets is supported on the camera.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 11.3.4.5
             */
            mechanicalPresets: BitFlag(4)
        },

        /**
         * This metadata controls which CameraAvSettingsUserLevelManagementCluster elements matter.js activates for
         * specific feature combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { mechanicalPan: true }, component: MechanicalPanOrMechanicalTiltOrMechanicalZoomComponent },
            { flags: { mechanicalTilt: true }, component: MechanicalPanOrMechanicalTiltOrMechanicalZoomComponent },
            { flags: { mechanicalZoom: true }, component: MechanicalPanOrMechanicalTiltOrMechanicalZoomComponent },
            { flags: { mechanicalPresets: true }, component: MechanicalPresetsComponent },
            { flags: { digitalPtz: true }, component: DigitalPtzComponent },
            { flags: { mechanicalZoom: true }, component: MechanicalZoomComponent },
            { flags: { mechanicalTilt: true }, component: MechanicalTiltComponent },
            { flags: { mechanicalPan: true }, component: MechanicalPanComponent },
            {
                flags: { mechanicalPresets: true, mechanicalPan: true, mechanicalTilt: true, mechanicalZoom: true },
                component: false
            },
            {
                flags: { digitalPtz: false, mechanicalPan: false, mechanicalTilt: false, mechanicalZoom: false },
                component: false
            }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * This cluster provides an interface into controls associated with the operation of a camera that provides pan,
     * tilt, and zoom functions, either mechanically, or against a digital image.
     *
     * Per the Matter specification you cannot use {@link CameraAvSettingsUserLevelManagementCluster} without enabling
     * certain feature combinations. You must use the {@link with} factory method to obtain a working cluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 11.3
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const MPAN = { mechanicalPan: true };
    const MTILT = { mechanicalTilt: true };
    const MZOOM = { mechanicalZoom: true };
    const MPRESETS = { mechanicalPresets: true };
    const DPTZ = { digitalPtz: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Base.id,
        name: Base.name,
        revision: Base.revision,
        features: Base.features,

        attributes: {
            mptzPosition: MutableCluster.AsConditional(
                MechanicalPanOrMechanicalTiltOrMechanicalZoomComponent.attributes.mptzPosition,
                { mandatoryIf: [MPAN, MTILT, MZOOM] }
            ),
            maxPresets: MutableCluster.AsConditional(
                MechanicalPresetsComponent.attributes.maxPresets,
                { mandatoryIf: [MPRESETS] }
            ),
            mptzPresets: MutableCluster.AsConditional(
                MechanicalPresetsComponent.attributes.mptzPresets,
                { mandatoryIf: [MPRESETS] }
            ),
            dptzStreams: MutableCluster.AsConditional(
                DigitalPtzComponent.attributes.dptzStreams,
                { mandatoryIf: [DPTZ] }
            ),
            zoomMax: MutableCluster.AsConditional(MechanicalZoomComponent.attributes.zoomMax, { mandatoryIf: [MZOOM] }),
            tiltMin: MutableCluster.AsConditional(MechanicalTiltComponent.attributes.tiltMin, { mandatoryIf: [MTILT] }),
            tiltMax: MutableCluster.AsConditional(MechanicalTiltComponent.attributes.tiltMax, { mandatoryIf: [MTILT] }),
            panMin: MutableCluster.AsConditional(MechanicalPanComponent.attributes.panMin, { mandatoryIf: [MPAN] }),
            panMax: MutableCluster.AsConditional(MechanicalPanComponent.attributes.panMax, { mandatoryIf: [MPAN] }),
            movementState: MutableCluster.AsConditional(
                MechanicalPanOrMechanicalTiltOrMechanicalZoomComponent.attributes.movementState,
                { mandatoryIf: [MPAN, MTILT, MZOOM] }
            )
        },

        commands: {
            mptzSetPosition: MutableCluster.AsConditional(
                MechanicalPanOrMechanicalTiltOrMechanicalZoomComponent.commands.mptzSetPosition,
                { mandatoryIf: [MPAN, MTILT, MZOOM] }
            ),
            mptzRelativeMove: MutableCluster.AsConditional(
                MechanicalPanOrMechanicalTiltOrMechanicalZoomComponent.commands.mptzRelativeMove,
                { mandatoryIf: [MPAN, MTILT, MZOOM] }
            ),
            mptzMoveToPreset: MutableCluster.AsConditional(
                MechanicalPresetsComponent.commands.mptzMoveToPreset,
                { mandatoryIf: [MPRESETS] }
            ),
            mptzSavePreset: MutableCluster.AsConditional(
                MechanicalPresetsComponent.commands.mptzSavePreset,
                { mandatoryIf: [MPRESETS] }
            ),
            mptzRemovePreset: MutableCluster.AsConditional(
                MechanicalPresetsComponent.commands.mptzRemovePreset,
                { mandatoryIf: [MPRESETS] }
            ),
            dptzSetViewport: MutableCluster.AsConditional(
                DigitalPtzComponent.commands.dptzSetViewport,
                { mandatoryIf: [DPTZ] }
            ),
            dptzRelativeMove: MutableCluster.AsConditional(
                DigitalPtzComponent.commands.dptzRelativeMove,
                { optionalIf: [DPTZ] }
            )
        }
    });

    /**
     * This cluster supports all CameraAvSettingsUserLevelManagement features. It may support illegal feature
     * combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type CameraAvSettingsUserLevelManagementCluster = CameraAvSettingsUserLevelManagement.Cluster;
export const CameraAvSettingsUserLevelManagementCluster = CameraAvSettingsUserLevelManagement.Cluster;
ClusterRegistry.register(CameraAvSettingsUserLevelManagement.Complete);
