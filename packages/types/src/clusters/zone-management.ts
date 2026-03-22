/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { FixedAttribute, Command, TlvNoResponse, WritableAttribute, Attribute, Event } from "../cluster/Cluster.js";
import { TlvUInt8, TlvUInt16, TlvEnum, TlvUInt32 } from "../tlv/TlvNumber.js";
import { TlvField, TlvObject, TlvOptionalField } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { AccessLevel } from "@matter/model";
import { TlvString } from "../tlv/TlvString.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { Priority } from "../globals/Priority.js";
import { ClusterType } from "../cluster/ClusterType.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace ZoneManagement {
    /**
     * These are optional features supported by ZoneManagementCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.4
     */
    export enum Feature {
        /**
         * TwoDimensionalCartesianZone (TWODCART)
         *
         * When this feature is supported, Zones based on a 2 Dimensional Cartesian plane may be defined and shall be
         * represented by a TwoDCartesianZoneStruct. Within a TwoDCartesianZoneStruct the bounding of the zone shall be
         * a polygon defined by a list of vertices comprising X (horizontal) and Y (vertical) coordinates, with each
         * vertex defining the point where adjacent edges meet and an implicit connection between the last and first
         * vertices in the list.
         *
         * The origin (0,0) shall be located at the top left of the Cartesian plane, with positive X and Y values moving
         * right and down across the Cartesian plane respectively.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.4.1
         */
        TwoDimensionalCartesianZone = "TwoDimensionalCartesianZone",

        /**
         * PerZoneSensitivity (PERZONESENS)
         *
         * When this feature is supported, the ZoneTriggerControlStruct shall be used for specifying a zone specific
         * value for the sensitivity of that zone to trigger events. If not supported, only the Sensitivity Attribute
         * shall be used.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.4.2
         */
        PerZoneSensitivity = "PerZoneSensitivity",

        /**
         * UserDefined (USERDEFINED)
         *
         * When this feature is supported, the device allows for creating and managing user defined zones via commands.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.4.3
         */
        UserDefined = "UserDefined",

        /**
         * FocusZones (FOCUSZONES)
         *
         * When this feature is supported, the device allows for creating and managing user defined Focus Value zones
         * via commands.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.4.4
         */
        FocusZones = "FocusZones"
    }

    /**
     * Input to the ZoneManagement removeZone command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.4
     */
    export const TlvRemoveZoneRequest = TlvObject({
        /**
         * The ZoneID field shall be a ZoneID of the Zone to be removed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.4.1
         */
        zoneId: TlvField(0, TlvUInt16)
    });

    /**
     * Input to the ZoneManagement removeZone command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.4
     */
    export interface RemoveZoneRequest extends TypeFromSchema<typeof TlvRemoveZoneRequest> {}

    /**
     * This struct is used to encode a point on the 2 Dimensional Cartesian Plane for the TwoDCartesianZone feature.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.6
     */
    export const TlvTwoDCartesianVertex = TlvObject({
        /**
         * This field shall represent the position of the vertex along the horizontal (x) axis.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.6.1
         */
        x: TlvField(0, TlvUInt16),

        /**
         * This field shall represent the position of the vertex along the vertical (y) axis.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.6.2
         */
        y: TlvField(1, TlvUInt16)
    });

    /**
     * This struct is used to encode a point on the 2 Dimensional Cartesian Plane for the TwoDCartesianZone feature.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.6
     */
    export interface TwoDCartesianVertex extends TypeFromSchema<typeof TlvTwoDCartesianVertex> {}

    /**
     * This data type is derived from enum8, and is used to indicate intended Zone usage.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.2
     */
    export enum ZoneUse {
        /**
         * Indicates Zone is intended to detect Motion
         *
         * This value indicates the Zone is intended to be used for motion detection
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.2.1
         */
        Motion = 0,

        /**
         * Indicates Zone is intended to protect privacy
         *
         * This value indicates the Zone is intended to be used for privacy blocking. All pixels within Privacy Zones
         * shall be replaced with black.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.2.2
         */
        Privacy = 1,

        /**
         * Indicates Zone provides a focus area
         *
         * This value indicates the Zone is intended to be a focal point for quality or analysis. Implementations may
         * increase encoding quality within this type of Zone at the expense of other areas.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.2.3
         */
        Focus = 2
    }

    /**
     * This struct is used to encode all information needed to define a TwoDCartesianZone.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.7
     */
    export const TlvTwoDCartesianZone = TlvObject({
        /**
         * The Name field shall be a string representing the name of the Zone. This is not guaranteed to be unique.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.7.1
         */
        name: TlvField(0, TlvString.bound({ maxLength: 32 })),

        /**
         * The Use field shall be a Zone Use Enum representing the purpose of the Zone.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.7.2
         */
        use: TlvField(1, TlvEnum<ZoneUse>()),

        /**
         * The Vertices field shall be a list of vertices of type TwoDCartesianVertexStruct. These vertices define a
         * simple polygon on the TwoD Cartesian plane, which represents the bounds of the TwoD Cartesian Zone with an
         * implicit connection between the last and first list items.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.7.3
         */
        vertices: TlvField(2, TlvArray(TlvTwoDCartesianVertex, { minLength: 3, maxLength: 12 })),

        /**
         * This field shall indicate the color, in RGB or RGBA, used for attaching a color to the Zone definition and is
         * a purely informational value to help in uniformly presenting Zones in User Interfaces and may be ignored. The
         * value shall conform to the 6-digit or 8-digit format defined for CSS sRGB hexadecimal color notation. If a
         * 6-digit format is used, then the alpha component shall assume the value of 0 meaning fully transparent
         * interior.
         *
         * Examples:
         *
         *   - #00FFFF for R=0x00, G=0xFF, B=0xFF, A absent - For a light-blue zone with full transparency.
         *
         *   - #00FFFF80 for R=0x00, G=0xFF, B=0xFF, A=0x80 - For a light-blue zone with partial interior transparency.
         *
         *   - #000000FF for R=0x00, G=0x00, B=0x00, A=0xFF - For a Privacy type zone that is black and fully opaque
         *     interior.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.7.4
         */
        color: TlvOptionalField(3, TlvString)
    });

    /**
     * This struct is used to encode all information needed to define a TwoDCartesianZone.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.7
     */
    export interface TwoDCartesianZone extends TypeFromSchema<typeof TlvTwoDCartesianZone> {}

    /**
     * Input to the ZoneManagement createTwoDCartesianZone command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.1
     */
    export const TlvCreateTwoDCartesianZoneRequest = TlvObject({
        /**
         * The Zone field shall be a TwoDCartesianZoneStruct representing all information required to define the TwoD
         * Cartesian Zone.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.1.1
         */
        zone: TlvField(0, TlvTwoDCartesianZone)
    });

    /**
     * Input to the ZoneManagement createTwoDCartesianZone command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.1
     */
    export interface CreateTwoDCartesianZoneRequest extends TypeFromSchema<typeof TlvCreateTwoDCartesianZoneRequest> {}

    /**
     * This command shall be generated in response to a CreateTwoDCartesianZone command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.2
     */
    export const TlvCreateTwoDCartesianZoneResponse = TlvObject({
        /**
         * The ZoneID field shall be an unsigned 16 bit integer representing the unique ZoneID.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.2.1
         */
        zoneId: TlvField(0, TlvUInt16)
    });

    /**
     * This command shall be generated in response to a CreateTwoDCartesianZone command.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.2
     */
    export interface CreateTwoDCartesianZoneResponse extends TypeFromSchema<typeof TlvCreateTwoDCartesianZoneResponse> {}

    /**
     * Input to the ZoneManagement updateTwoDCartesianZone command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.3
     */
    export const TlvUpdateTwoDCartesianZoneRequest = TlvObject({
        /**
         * The ZoneID field shall be a ZoneID of the Zone to be updated.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.3.1
         */
        zoneId: TlvField(0, TlvUInt16),

        /**
         * The Zone field shall be a TwoDCartesianZoneStruct representing updated Zone information.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.3.2
         */
        zone: TlvField(1, TlvTwoDCartesianZone)
    });

    /**
     * Input to the ZoneManagement updateTwoDCartesianZone command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.3
     */
    export interface UpdateTwoDCartesianZoneRequest extends TypeFromSchema<typeof TlvUpdateTwoDCartesianZoneRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.1
     */
    export enum ZoneType {
        /**
         * Indicates a Two Dimensional Cartesian Zone
         */
        TwoDcartZone = 0
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.3
     */
    export enum ZoneSource {
        /**
         * Indicates a Manufacturer defined Zone.
         *
         * This value indicates the Zone is built-in and provided by the manufacturer of the device. Zones of this type
         * can’t be created or modified using commands in this cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.3.1
         */
        Mfg = 0,

        /**
         * Indicates a User defined Zone.
         *
         * This value indicates the Zone was defined and created by a user. Zones of this type can be created, modified
         * or deleted using commands in this cluster.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.3.2
         */
        User = 1
    }

    /**
     * This struct is used to encode basic information about a Zone without containing the specifics of how the zone is
     * defined.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.8
     */
    export const TlvZoneInformation = TlvObject({
        /**
         * This field shall indicate the unique ZoneID of the Zone.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.8.1
         */
        zoneId: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate the zone type which defines the Zone.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.8.2
         */
        zoneType: TlvField(1, TlvEnum<ZoneType>()),

        /**
         * This field shall indicate the source of the Zone.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.8.3
         */
        zoneSource: TlvField(2, TlvEnum<ZoneSource>()),

        /**
         * This field shall indicate the detailed information for the TwoDCartesianZone.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.8.4
         */
        twoDCartesianZone: TlvOptionalField(3, TlvTwoDCartesianZone)
    });

    /**
     * This struct is used to encode basic information about a Zone without containing the specifics of how the zone is
     * defined.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.8
     */
    export interface ZoneInformation extends TypeFromSchema<typeof TlvZoneInformation> {}

    /**
     * This struct is used to encode a set of values for controlling the generation of ZoneTriggered and ZoneStopped
     * events from the Node.
     *
     * Zone events can be triggered due to many underlying reasons, such as a motion sensor on the device, and this is
     * intended to be manufacturer-specific. When a triggering activity is initially detected, the Node shall generate a
     * ZoneTriggered event.
     *
     * This places the Node in a triggered state, at which point the Node shall internally track two values.
     *
     * The time in seconds since the initial triggering activity.
     *
     * Initially set to the InitialDuration value.
     *
     * If the TriggerDetectedDuration value is exceeded by the TimeSinceInitialTrigger, the Node shall generate a
     * ZoneStopped event with the reason parameter set to ActionStopped.
     *
     * However, if additional triggering actions are detected during this period, the Node shall increase the
     * TriggerDetectedDuration value by the AugmentationDuration value. This process can occur repeatedly but after the
     * first increase of TriggerDetectedDuration the Node shall NOT increase the TriggerDetectedDuration value unless
     * the previous TriggerDetectedDuration has been exceeded by the TimeSinceInitialTrigger.
     *
     * If the TimeSinceInitialTrigger value exceeds the MaxDuration value, the Node shall generate a ZoneStopped with
     * the reason parameter set to Timeout.
     *
     * Once a ZoneStopped event has been generated, the Node shall stop detecting the triggering activity for the period
     * of the BlindDuration value.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.9
     */
    export const TlvZoneTriggerControl = TlvObject({
        /**
         * This field shall indicate the unique ZoneID of the Zone this Trigger applies to.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.9.1
         */
        zoneId: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate the initial duration in seconds after triggering activity is first detected before
         * the Node could generate a ZoneStopped event.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.9.2
         */
        initialDuration: TlvField(1, TlvUInt32.bound({ min: 1, max: 65535 })),

        /**
         * This field shall indicate the duration in seconds that the TriggerDetectedDuration value is to be extended by
         * if the triggering activity is still detected during this period.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.9.3
         */
        augmentationDuration: TlvField(2, TlvUInt32),

        /**
         * This field shall indicate the maximum duration in seconds after the initial triggering activity detection
         * that additional triggering activity will be detected.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.9.4
         */
        maxDuration: TlvField(3, TlvUInt32),

        /**
         * This field shall indicate the duration in seconds after a ZoneStopped event is generated that the Node shall
         * NOT generate any ZoneTriggered events.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.9.5
         */
        blindDuration: TlvField(4, TlvUInt32),

        /**
         * This field shall indicate the per-zone sensitivity of the underlying zone triggering detection mechanism. The
         * higher the value, the more sensitive the detection. The actual meaning of the values is
         * implementation-specific.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.9.6
         */
        sensitivity: TlvOptionalField(5, TlvUInt8.bound({ min: 1 }))
    });

    /**
     * This struct is used to encode a set of values for controlling the generation of ZoneTriggered and ZoneStopped
     * events from the Node.
     *
     * Zone events can be triggered due to many underlying reasons, such as a motion sensor on the device, and this is
     * intended to be manufacturer-specific. When a triggering activity is initially detected, the Node shall generate a
     * ZoneTriggered event.
     *
     * This places the Node in a triggered state, at which point the Node shall internally track two values.
     *
     * The time in seconds since the initial triggering activity.
     *
     * Initially set to the InitialDuration value.
     *
     * If the TriggerDetectedDuration value is exceeded by the TimeSinceInitialTrigger, the Node shall generate a
     * ZoneStopped event with the reason parameter set to ActionStopped.
     *
     * However, if additional triggering actions are detected during this period, the Node shall increase the
     * TriggerDetectedDuration value by the AugmentationDuration value. This process can occur repeatedly but after the
     * first increase of TriggerDetectedDuration the Node shall NOT increase the TriggerDetectedDuration value unless
     * the previous TriggerDetectedDuration has been exceeded by the TimeSinceInitialTrigger.
     *
     * If the TimeSinceInitialTrigger value exceeds the MaxDuration value, the Node shall generate a ZoneStopped with
     * the reason parameter set to Timeout.
     *
     * Once a ZoneStopped event has been generated, the Node shall stop detecting the triggering activity for the period
     * of the BlindDuration value.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.9
     */
    export interface ZoneTriggerControl extends TypeFromSchema<typeof TlvZoneTriggerControl> {}

    /**
     * Input to the ZoneManagement createOrUpdateTrigger command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.5
     */
    export const TlvCreateOrUpdateTriggerRequest = TlvObject({
        /**
         * This field shall be a ZoneTriggerControlStruct representing all information required to define the Trigger
         * conditions.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.5.1
         */
        trigger: TlvField(0, TlvZoneTriggerControl)
    });

    /**
     * Input to the ZoneManagement createOrUpdateTrigger command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.5
     */
    export interface CreateOrUpdateTriggerRequest extends TypeFromSchema<typeof TlvCreateOrUpdateTriggerRequest> {}

    /**
     * Input to the ZoneManagement removeTrigger command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.6
     */
    export const TlvRemoveTriggerRequest = TlvObject({
        /**
         * The ZoneID field shall be a ZoneID of the Zone Trigger to be removed.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.6.1
         */
        zoneId: TlvField(0, TlvUInt16)
    });

    /**
     * Input to the ZoneManagement removeTrigger command
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.6
     */
    export interface RemoveTriggerRequest extends TypeFromSchema<typeof TlvRemoveTriggerRequest> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.4
     */
    export enum ZoneEventTriggeredReason {
        /**
         * Zone event triggered because motion is detected
         */
        Motion = 0
    }

    /**
     * Body of the ZoneManagement zoneTriggered event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.8.1
     */
    export const TlvZoneTriggeredEvent = TlvObject({
        /**
         * This field shall contain the ZoneID of the Zone that triggered.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.8.1.1
         */
        zone: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate why the zone was triggered.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.8.1.2
         */
        reason: TlvField(1, TlvEnum<ZoneEventTriggeredReason>())
    });

    /**
     * Body of the ZoneManagement zoneTriggered event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.8.1
     */
    export interface ZoneTriggeredEvent extends TypeFromSchema<typeof TlvZoneTriggeredEvent> {}

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.5.5
     */
    export enum ZoneEventStoppedReason {
        /**
         * Indicates that whatever triggered the Zone event has stopped being detected.
         */
        ActionStopped = 0,

        /**
         * Indicates that the max duration for detecting triggering activity has been reached.
         */
        Timeout = 1
    }

    /**
     * Body of the ZoneManagement zoneStopped event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.8.2
     */
    export const TlvZoneStoppedEvent = TlvObject({
        /**
         * This field shall contain the ZoneID of the Zone that stopped.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.8.2.1
         */
        zone: TlvField(0, TlvUInt16),

        /**
         * This field shall indicate why the zone stopped triggering.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.14.8.2.2
         */
        reason: TlvField(1, TlvEnum<ZoneEventStoppedReason>())
    });

    /**
     * Body of the ZoneManagement zoneStopped event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14.8.2
     */
    export interface ZoneStoppedEvent extends TypeFromSchema<typeof TlvZoneStoppedEvent> {}

    /**
     * A ZoneManagementCluster supports these elements if it supports feature UserDefined.
     */
    export const UserDefinedComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute shall specify the maximum number of user-defined zones that can be supported by the Node.
             * This value is manufacturer-defined.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.6.1
             */
            maxUserDefinedZones: FixedAttribute(0x0, TlvUInt8.bound({ min: 5 }))
        },

        commands: {
            /**
             * This command shall remove the user-defined Zone indicated by ZoneID.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.4
             */
            removeZone: Command(0x3, TlvRemoveZoneRequest, 0x3, TlvNoResponse, { invokeAcl: AccessLevel.Manage })
        }
    });

    /**
     * A ZoneManagementCluster supports these elements if doesn't support feature PERZONESENS.
     */
    export const NotPerZoneSensitivityComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute shall specify the sensitivity of the underlying zone triggering detection mechanism if the
             * PerZoneSensitivity features is not supported. The higher the value the more sensitive the detection. The
             * actual meaning of the values is implementation specific.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.6.6
             */
            sensitivity: WritableAttribute(0x5, TlvUInt8.bound({ min: 1 }), { persistent: true })
        }
    });

    /**
     * A ZoneManagementCluster supports these elements if it supports feature TwoDimensionalCartesianZone.
     */
    export const TwoDimensionalCartesianZoneComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute shall specify the maximum X and Y points that are allowed for TwoD Cartesian Zones. If
             * this cluster is on the same endpoint as Camera AV Stream Management Cluster, these values shall be equal
             * to the value of SensorWidth - 1 and SensorHeight - 1 from the VideoSensorParams attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.6.7
             */
            twoDCartesianMax: FixedAttribute(0x6, TlvTwoDCartesianVertex)
        }
    });

    /**
     * A ZoneManagementCluster supports these elements if it supports features TwoDimensionalCartesianZone and
     * UserDefined.
     */
    export const TwoDimensionalCartesianZoneAndUserDefinedComponent = MutableCluster.Component({
        commands: {
            /**
             * This command shall create and store a TwoD Cartesian Zone.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.1
             */
            createTwoDCartesianZone: Command(
                0x0,
                TlvCreateTwoDCartesianZoneRequest,
                0x1,
                TlvCreateTwoDCartesianZoneResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * The UpdateTwoDCartesianZone shall update a stored TwoD Cartesian Zone.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.3
             */
            updateTwoDCartesianZone: Command(
                0x2,
                TlvUpdateTwoDCartesianZoneRequest,
                0x2,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * These elements and properties are present in all ZoneManagement clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x550,
        name: "ZoneManagement",
        revision: 1,

        features: {
            /**
             * When this feature is supported, Zones based on a 2 Dimensional Cartesian plane may be defined and shall
             * be represented by a TwoDCartesianZoneStruct. Within a TwoDCartesianZoneStruct the bounding of the zone
             * shall be a polygon defined by a list of vertices comprising X (horizontal) and Y (vertical) coordinates,
             * with each vertex defining the point where adjacent edges meet and an implicit connection between the last
             * and first vertices in the list.
             *
             * The origin (0,0) shall be located at the top left of the Cartesian plane, with positive X and Y values
             * moving right and down across the Cartesian plane respectively.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.4.1
             */
            twoDimensionalCartesianZone: BitFlag(0),

            /**
             * When this feature is supported, the ZoneTriggerControlStruct shall be used for specifying a zone specific
             * value for the sensitivity of that zone to trigger events. If not supported, only the Sensitivity
             * Attribute shall be used.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.4.2
             */
            perZoneSensitivity: BitFlag(1),

            /**
             * When this feature is supported, the device allows for creating and managing user defined zones via
             * commands.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.4.3
             */
            userDefined: BitFlag(2),

            /**
             * When this feature is supported, the device allows for creating and managing user defined Focus Value
             * zones via commands.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.4.4
             */
            focusZones: BitFlag(3)
        },

        attributes: {
            /**
             * This attribute shall specify the maximum number of zones allowed to created. This value shall be the sum
             * of the number of predefined Mfg Zones, and MaxUserDefinedZones, if supported. This value is
             * manufacturer-defined.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.6.2
             */
            maxZones: FixedAttribute(0x1, TlvUInt8.bound({ min: 1 })),

            /**
             * This attribute shall specify all currently defined zones as a list of ZoneInformationStruct. Use the
             * commands from this cluster to add, update or remove entries.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.6.3
             */
            zones: Attribute(0x2, TlvArray(TlvZoneInformation, { minLength: 0 }), { persistent: true, default: [] }),

            /**
             * This attribute shall specify all currently defined triggers controlling the generation of ZoneTriggered
             * and ZoneStopped events and shall be a list of ZoneTriggerControlStruct. To add an entry use
             * CreateOrUpdateTrigger. To remove an entry use RemoveTrigger.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.6.4
             */
            triggers: Attribute(
                0x3,
                TlvArray(TlvZoneTriggerControl, { minLength: 0 }),
                { persistent: true, default: [] }
            ),

            /**
             * This attribute shall specify the hardware specific value for the number of supported sensitivity levels.
             * This value is manufacturer defined. If the PerZoneSensitivity feature is supported, the value of this
             * attribute determines valid values for the Sensitivity field in ZoneTriggerControlStruct; if the
             * PerZoneSensitivity feature is not supported, the value of this attribute determines valid values for the
             * Sensitivity Attribute. Implementations require two to ten levels of sensitivity control in order to
             * ensure that there is some user-level customization of the Trigger.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.6.5
             */
            sensitivityMax: FixedAttribute(0x4, TlvUInt8.bound({ min: 2, max: 10 }))
        },

        commands: {
            /**
             * This command is used to create or update a Trigger for the specified motion Zone.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.5
             */
            createOrUpdateTrigger: Command(
                0x4,
                TlvCreateOrUpdateTriggerRequest,
                0x4,
                TlvNoResponse,
                { invokeAcl: AccessLevel.Manage }
            ),

            /**
             * This command shall remove the Trigger for the provided ZoneID.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.7.6
             */
            removeTrigger: Command(0x5, TlvRemoveTriggerRequest, 0x5, TlvNoResponse, { invokeAcl: AccessLevel.Manage })
        },

        events: {
            /**
             * This event shall be generated when a Zone is first triggered.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.8.1
             */
            zoneTriggered: Event(0x0, Priority.Info, TlvZoneTriggeredEvent),

            /**
             * This event shall be generated when either the TriggerDetectedDuration value is exceeded by the
             * TimeSinceInitialTrigger value or the MaxDuration value is exceeded by the TimeSinceInitialTrigger value,
             * as described in Section 2.14.5.9, “ZoneTriggerControlStruct”.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.14.8.2
             */
            zoneStopped: Event(0x1, Priority.Info, TlvZoneStoppedEvent)
        },

        /**
         * This metadata controls which ZoneManagementCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { userDefined: true }, component: UserDefinedComponent },
            { flags: { perZoneSensitivity: false }, component: NotPerZoneSensitivityComponent },
            { flags: { twoDimensionalCartesianZone: true }, component: TwoDimensionalCartesianZoneComponent },
            {
                flags: { twoDimensionalCartesianZone: true, userDefined: true },
                component: TwoDimensionalCartesianZoneAndUserDefinedComponent
            },
            { flags: { perZoneSensitivity: true, twoDimensionalCartesianZone: false }, component: false },
            { flags: { userDefined: true, twoDimensionalCartesianZone: false }, component: false },
            { flags: { focusZones: true, userDefined: false }, component: false }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({ ...Base, base: ClusterType(Base) }, NotPerZoneSensitivityComponent);

    /**
     * This cluster provides an interface to manage regions of interest, or Zones, which can be either manufacturer or
     * user defined.
     *
     * This cluster also defines a Trigger, which is a set of conditions and timing that apply to a Zone and allow for
     * events to be generated or the triggering state to be used by other clusters such as Push AV Stream Transport
     * Cluster.
     *
     * ZoneManagementCluster supports optional features that you can enable with the ZoneManagementCluster.with()
     * factory method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.14
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const USERDEFINED = { userDefined: true };
    const TWODCART = { twoDimensionalCartesianZone: true };
    const TWODCART_USERDEFINED = { twoDimensionalCartesianZone: true, userDefined: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            ...Cluster.attributes,
            maxUserDefinedZones: MutableCluster.AsConditional(
                UserDefinedComponent.attributes.maxUserDefinedZones,
                { mandatoryIf: [USERDEFINED] }
            ),
            sensitivity: MutableCluster.AsConditional(
                NotPerZoneSensitivityComponent.attributes.sensitivity,
                { mandatoryIf: [] }
            ),
            twoDCartesianMax: MutableCluster.AsConditional(
                TwoDimensionalCartesianZoneComponent.attributes.twoDCartesianMax,
                { mandatoryIf: [TWODCART] }
            )
        },

        commands: {
            ...Cluster.commands,
            createTwoDCartesianZone: MutableCluster.AsConditional(
                TwoDimensionalCartesianZoneAndUserDefinedComponent.commands.createTwoDCartesianZone,
                { mandatoryIf: [TWODCART_USERDEFINED] }
            ),
            updateTwoDCartesianZone: MutableCluster.AsConditional(
                TwoDimensionalCartesianZoneAndUserDefinedComponent.commands.updateTwoDCartesianZone,
                { mandatoryIf: [TWODCART_USERDEFINED] }
            ),
            removeZone: MutableCluster.AsConditional(
                UserDefinedComponent.commands.removeZone,
                { mandatoryIf: [USERDEFINED] }
            )
        },

        events: Cluster.events
    });

    /**
     * This cluster supports all ZoneManagement features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type ZoneManagementCluster = ZoneManagement.Cluster;
export const ZoneManagementCluster = ZoneManagement.Cluster;
ClusterRegistry.register(ZoneManagement.Complete);
