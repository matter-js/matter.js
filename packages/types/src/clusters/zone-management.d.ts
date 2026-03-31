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

/**
 * Definitions for the ZoneManagement cluster.
 *
 * This cluster provides an interface to manage regions of interest, or Zones, which can be either manufacturer or user
 * defined.
 *
 * This cluster also defines a Trigger, which is a set of conditions and timing that apply to a Zone and allow for
 * events to be generated or the triggering state to be used by other clusters such as Push AV Stream Transport Cluster.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 2.14
 */
export declare namespace ZoneManagement {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0550;

    /**
     * Textual cluster identifier.
     */
    export const name: "ZoneManagement";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the ZoneManagement cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link ZoneManagement} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * This attribute shall specify the maximum number of zones allowed to created. This value shall be the sum of
         * the number of predefined Mfg Zones, and MaxUserDefinedZones, if supported. This value is
         * manufacturer-defined.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.6.2
         */
        maxZones: number;

        /**
         * This attribute shall specify all currently defined zones as a list of ZoneInformationStruct. Use the commands
         * from this cluster to add, update or remove entries.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.6.3
         */
        zones: ZoneInformation[];

        /**
         * This attribute shall specify all currently defined triggers controlling the generation of ZoneTriggered and
         * ZoneStopped events and shall be a list of ZoneTriggerControlStruct. To add an entry use
         * CreateOrUpdateTrigger. To remove an entry use RemoveTrigger.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.6.4
         */
        triggers: ZoneTriggerControl[];

        /**
         * This attribute shall specify the hardware specific value for the number of supported sensitivity levels. This
         * value is manufacturer defined. If the PerZoneSensitivity feature is supported, the value of this attribute
         * determines valid values for the Sensitivity field in ZoneTriggerControlStruct; if the PerZoneSensitivity
         * feature is not supported, the value of this attribute determines valid values for the Sensitivity Attribute.
         * Implementations require two to ten levels of sensitivity control in order to ensure that there is some
         * user-level customization of the Trigger.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.6.5
         */
        sensitivityMax: number;
    }

    /**
     * {@link ZoneManagement} supports these elements if it supports feature "UserDefined".
     */
    export interface UserDefinedAttributes {
        /**
         * This attribute shall specify the maximum number of user-defined zones that can be supported by the Node. This
         * value is manufacturer-defined.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.6.1
         */
        maxUserDefinedZones: number;
    }

    /**
     * {@link ZoneManagement} supports these elements if it supports feature "NotPerZoneSensitivity".
     */
    export interface NotPerZoneSensitivityAttributes {
        /**
         * This attribute shall specify the sensitivity of the underlying zone triggering detection mechanism if the
         * PerZoneSensitivity features is not supported. The higher the value the more sensitive the detection. The
         * actual meaning of the values is implementation specific.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.6.6
         */
        sensitivity: number;
    }

    /**
     * {@link ZoneManagement} supports these elements if it supports feature "TwoDimensionalCartesianZone".
     */
    export interface TwoDimensionalCartesianZoneAttributes {
        /**
         * This attribute shall specify the maximum X and Y points that are allowed for TwoD Cartesian Zones. If this
         * cluster is on the same endpoint as Camera AV Stream Management Cluster, these values shall be equal to the
         * value of SensorWidth - 1 and SensorHeight - 1 from the VideoSensorParams attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.6.7
         */
        twoDCartesianMax: TwoDCartesianVertex;
    }

    /**
     * Attributes that may appear in {@link ZoneManagement}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * This attribute shall specify the maximum number of zones allowed to created. This value shall be the sum of
         * the number of predefined Mfg Zones, and MaxUserDefinedZones, if supported. This value is
         * manufacturer-defined.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.6.2
         */
        maxZones: number;

        /**
         * This attribute shall specify all currently defined zones as a list of ZoneInformationStruct. Use the commands
         * from this cluster to add, update or remove entries.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.6.3
         */
        zones: ZoneInformation[];

        /**
         * This attribute shall specify all currently defined triggers controlling the generation of ZoneTriggered and
         * ZoneStopped events and shall be a list of ZoneTriggerControlStruct. To add an entry use
         * CreateOrUpdateTrigger. To remove an entry use RemoveTrigger.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.6.4
         */
        triggers: ZoneTriggerControl[];

        /**
         * This attribute shall specify the hardware specific value for the number of supported sensitivity levels. This
         * value is manufacturer defined. If the PerZoneSensitivity feature is supported, the value of this attribute
         * determines valid values for the Sensitivity field in ZoneTriggerControlStruct; if the PerZoneSensitivity
         * feature is not supported, the value of this attribute determines valid values for the Sensitivity Attribute.
         * Implementations require two to ten levels of sensitivity control in order to ensure that there is some
         * user-level customization of the Trigger.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.6.5
         */
        sensitivityMax: number;

        /**
         * This attribute shall specify the maximum number of user-defined zones that can be supported by the Node. This
         * value is manufacturer-defined.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.6.1
         */
        maxUserDefinedZones: number;

        /**
         * This attribute shall specify the sensitivity of the underlying zone triggering detection mechanism if the
         * PerZoneSensitivity features is not supported. The higher the value the more sensitive the detection. The
         * actual meaning of the values is implementation specific.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.6.6
         */
        sensitivity: number;

        /**
         * This attribute shall specify the maximum X and Y points that are allowed for TwoD Cartesian Zones. If this
         * cluster is on the same endpoint as Camera AV Stream Management Cluster, these values shall be equal to the
         * value of SensorWidth - 1 and SensorHeight - 1 from the VideoSensorParams attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.6.7
         */
        twoDCartesianMax: TwoDCartesianVertex;
    }

    /**
     * {@link ZoneManagement} always supports these elements.
     */
    export interface BaseCommands {
        /**
         * This command is used to create or update a Trigger for the specified motion Zone.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.5
         */
        createOrUpdateTrigger(request: CreateOrUpdateTriggerRequest): MaybePromise;

        /**
         * This command shall remove the Trigger for the provided ZoneID.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.6
         */
        removeTrigger(request: RemoveTriggerRequest): MaybePromise;
    }

    /**
     * {@link ZoneManagement} supports these elements if it supports feature "UserDefined".
     */
    export interface UserDefinedCommands {
        /**
         * This command shall remove the user-defined Zone indicated by ZoneID.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.4
         */
        removeZone(request: RemoveZoneRequest): MaybePromise;
    }

    /**
     * {@link ZoneManagement} supports these elements if it supports feature
     * "TwoDimensionalCartesianZoneAndUserDefined".
     */
    export interface TwoDimensionalCartesianZoneAndUserDefinedCommands {
        /**
         * This command shall create and store a TwoD Cartesian Zone.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.1
         */
        createTwoDCartesianZone(request: CreateTwoDCartesianZoneRequest): MaybePromise<CreateTwoDCartesianZoneResponse>;

        /**
         * The UpdateTwoDCartesianZone shall update a stored TwoD Cartesian Zone.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.3
         */
        updateTwoDCartesianZone(request: UpdateTwoDCartesianZoneRequest): MaybePromise;
    }

    /**
     * Commands that may appear in {@link ZoneManagement}.
     */
    export interface Commands extends
        BaseCommands,
        UserDefinedCommands,
        TwoDimensionalCartesianZoneAndUserDefinedCommands
    {}

    /**
     * {@link ZoneManagement} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * This event shall be generated when a Zone is first triggered.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.8.1
         */
        zoneTriggered: ZoneTriggeredEvent;

        /**
         * This event shall be generated when either the TriggerDetectedDuration value is exceeded by the
         * TimeSinceInitialTrigger value or the MaxDuration value is exceeded by the TimeSinceInitialTrigger value, as
         * described in Section 2.14.5.9, “ZoneTriggerControlStruct”.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.8.2
         */
        zoneStopped: ZoneStoppedEvent;
    }

    /**
     * Events that may appear in {@link ZoneManagement}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * This event shall be generated when a Zone is first triggered.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.8.1
         */
        zoneTriggered: ZoneTriggeredEvent;

        /**
         * This event shall be generated when either the TriggerDetectedDuration value is exceeded by the
         * TimeSinceInitialTrigger value or the MaxDuration value is exceeded by the TimeSinceInitialTrigger value, as
         * described in Section 2.14.5.9, “ZoneTriggerControlStruct”.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.8.2
         */
        zoneStopped: ZoneStoppedEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, commands: BaseCommands, events: BaseEvents },
        { flags: { userDefined: true }, attributes: UserDefinedAttributes, commands: UserDefinedCommands },
        { flags: { perZoneSensitivity: false }, attributes: NotPerZoneSensitivityAttributes },
        { flags: { twoDimensionalCartesianZone: true }, attributes: TwoDimensionalCartesianZoneAttributes },
        {
            flags: { twoDimensionalCartesianZone: true, userDefined: true },
            commands: TwoDimensionalCartesianZoneAndUserDefinedCommands
        }
    ];

    export type Features = "TwoDimensionalCartesianZone" | "PerZoneSensitivity" | "UserDefined" | "FocusZones";

    /**
     * These are optional features supported by ZoneManagementCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.4
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
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.4.1
         */
        TwoDimensionalCartesianZone = "TwoDimensionalCartesianZone",

        /**
         * PerZoneSensitivity (PERZONESENS)
         *
         * When this feature is supported, the ZoneTriggerControlStruct shall be used for specifying a zone specific
         * value for the sensitivity of that zone to trigger events. If not supported, only the Sensitivity Attribute
         * shall be used.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.4.2
         */
        PerZoneSensitivity = "PerZoneSensitivity",

        /**
         * UserDefined (USERDEFINED)
         *
         * When this feature is supported, the device allows for creating and managing user defined zones via commands.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.4.3
         */
        UserDefined = "UserDefined",

        /**
         * FocusZones (FOCUSZONES)
         *
         * When this feature is supported, the device allows for creating and managing user defined Focus Value zones
         * via commands.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.4.4
         */
        FocusZones = "FocusZones"
    }

    /**
     * This struct is used to encode basic information about a Zone without containing the specifics of how the zone is
     * defined.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.8
     */
    export declare class ZoneInformation {
        constructor(values?: Partial<ZoneInformation>);

        /**
         * This field shall indicate the unique ZoneID of the Zone.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.8.1
         */
        zoneId: number;

        /**
         * This field shall indicate the zone type which defines the Zone.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.8.2
         */
        zoneType: ZoneType;

        /**
         * This field shall indicate the source of the Zone.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.8.3
         */
        zoneSource: ZoneSource;

        /**
         * This field shall indicate the detailed information for the TwoDCartesianZone.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.8.4
         */
        twoDCartesianZone?: TwoDCartesianZone;
    };

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
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.9
     */
    export declare class ZoneTriggerControl {
        constructor(values?: Partial<ZoneTriggerControl>);

        /**
         * This field shall indicate the unique ZoneID of the Zone this Trigger applies to.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.9.1
         */
        zoneId: number;

        /**
         * This field shall indicate the initial duration in seconds after triggering activity is first detected before
         * the Node could generate a ZoneStopped event.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.9.2
         */
        initialDuration: number;

        /**
         * This field shall indicate the duration in seconds that the TriggerDetectedDuration value is to be extended by
         * if the triggering activity is still detected during this period.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.9.3
         */
        augmentationDuration: number;

        /**
         * This field shall indicate the maximum duration in seconds after the initial triggering activity detection
         * that additional triggering activity will be detected.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.9.4
         */
        maxDuration: number;

        /**
         * This field shall indicate the duration in seconds after a ZoneStopped event is generated that the Node shall
         * NOT generate any ZoneTriggered events.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.9.5
         */
        blindDuration: number;

        /**
         * This field shall indicate the per-zone sensitivity of the underlying zone triggering detection mechanism. The
         * higher the value, the more sensitive the detection. The actual meaning of the values is
         * implementation-specific.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.9.6
         */
        sensitivity?: number;
    };

    /**
     * This struct is used to encode a point on the 2 Dimensional Cartesian Plane for the TwoDCartesianZone feature.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.6
     */
    export declare class TwoDCartesianVertex {
        constructor(values?: Partial<TwoDCartesianVertex>);

        /**
         * This field shall represent the position of the vertex along the horizontal (x) axis.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.6.1
         */
        x: number;

        /**
         * This field shall represent the position of the vertex along the vertical (y) axis.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.6.2
         */
        y: number;
    };

    /**
     * This command is used to create or update a Trigger for the specified motion Zone.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.5
     */
    export declare class CreateOrUpdateTriggerRequest {
        constructor(values?: Partial<CreateOrUpdateTriggerRequest>);

        /**
         * This field shall be a ZoneTriggerControlStruct representing all information required to define the Trigger
         * conditions.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.5.1
         */
        trigger: ZoneTriggerControl;
    };

    /**
     * This command shall remove the Trigger for the provided ZoneID.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.6
     */
    export declare class RemoveTriggerRequest {
        constructor(values?: Partial<RemoveTriggerRequest>);

        /**
         * The ZoneID field shall be a ZoneID of the Zone Trigger to be removed.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.6.1
         */
        zoneId: number;
    };

    /**
     * This command shall remove the user-defined Zone indicated by ZoneID.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.4
     */
    export declare class RemoveZoneRequest {
        constructor(values?: Partial<RemoveZoneRequest>);

        /**
         * The ZoneID field shall be a ZoneID of the Zone to be removed.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.4.1
         */
        zoneId: number;
    };

    /**
     * This command shall create and store a TwoD Cartesian Zone.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.1
     */
    export declare class CreateTwoDCartesianZoneRequest {
        constructor(values?: Partial<CreateTwoDCartesianZoneRequest>);

        /**
         * The Zone field shall be a TwoDCartesianZoneStruct representing all information required to define the TwoD
         * Cartesian Zone.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.1.1
         */
        zone: TwoDCartesianZone;
    };

    /**
     * This command shall be generated in response to a CreateTwoDCartesianZone command.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.2
     */
    export declare class CreateTwoDCartesianZoneResponse {
        constructor(values?: Partial<CreateTwoDCartesianZoneResponse>);

        /**
         * The ZoneID field shall be an unsigned 16 bit integer representing the unique ZoneID.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.2.1
         */
        zoneId: number;
    };

    /**
     * The UpdateTwoDCartesianZone shall update a stored TwoD Cartesian Zone.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.3
     */
    export declare class UpdateTwoDCartesianZoneRequest {
        constructor(values?: Partial<UpdateTwoDCartesianZoneRequest>);

        /**
         * The ZoneID field shall be a ZoneID of the Zone to be updated.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.3.1
         */
        zoneId: number;

        /**
         * The Zone field shall be a TwoDCartesianZoneStruct representing updated Zone information.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.7.3.2
         */
        zone: TwoDCartesianZone;
    };

    /**
     * This event shall be generated when a Zone is first triggered.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.8.1
     */
    export declare class ZoneTriggeredEvent {
        constructor(values?: Partial<ZoneTriggeredEvent>);

        /**
         * This field shall contain the ZoneID of the Zone that triggered.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.8.1.1
         */
        zone: number;

        /**
         * This field shall indicate why the zone was triggered.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.8.1.2
         */
        reason: ZoneEventTriggeredReason;
    };

    /**
     * This event shall be generated when either the TriggerDetectedDuration value is exceeded by the
     * TimeSinceInitialTrigger value or the MaxDuration value is exceeded by the TimeSinceInitialTrigger value, as
     * described in Section 2.14.5.9, “ZoneTriggerControlStruct”.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.8.2
     */
    export declare class ZoneStoppedEvent {
        constructor(values?: Partial<ZoneStoppedEvent>);

        /**
         * This field shall contain the ZoneID of the Zone that stopped.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.8.2.1
         */
        zone: number;

        /**
         * This field shall indicate why the zone stopped triggering.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.8.2.2
         */
        reason: ZoneEventStoppedReason;
    };

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.1
     */
    export enum ZoneType {
        /**
         * Indicates a Two Dimensional Cartesian Zone
         */
        TwoDcartZone = 0
    }

    /**
     * This data type is derived from enum8, and is used to indicate intended Zone usage.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.2
     */
    export enum ZoneUse {
        /**
         * Indicates Zone is intended to detect Motion
         *
         * This value indicates the Zone is intended to be used for motion detection
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.2.1
         */
        Motion = 0,

        /**
         * Indicates Zone is intended to protect privacy
         *
         * This value indicates the Zone is intended to be used for privacy blocking. All pixels within Privacy Zones
         * shall be replaced with black.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.2.2
         */
        Privacy = 1,

        /**
         * Indicates Zone provides a focus area
         *
         * This value indicates the Zone is intended to be a focal point for quality or analysis. Implementations may
         * increase encoding quality within this type of Zone at the expense of other areas.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.2.3
         */
        Focus = 2
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.3
     */
    export enum ZoneSource {
        /**
         * Indicates a Manufacturer defined Zone.
         *
         * This value indicates the Zone is built-in and provided by the manufacturer of the device. Zones of this type
         * can’t be created or modified using commands in this cluster.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.3.1
         */
        Mfg = 0,

        /**
         * Indicates a User defined Zone.
         *
         * This value indicates the Zone was defined and created by a user. Zones of this type can be created, modified
         * or deleted using commands in this cluster.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.3.2
         */
        User = 1
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.4
     */
    export enum ZoneEventTriggeredReason {
        /**
         * Zone event triggered because motion is detected
         */
        Motion = 0
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.5
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
     * This struct is used to encode all information needed to define a TwoDCartesianZone.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.7
     */
    export declare class TwoDCartesianZone {
        constructor(values?: Partial<TwoDCartesianZone>);

        /**
         * The Name field shall be a string representing the name of the Zone. This is not guaranteed to be unique.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.7.1
         */
        name: string;

        /**
         * The Use field shall be a Zone Use Enum representing the purpose of the Zone.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.7.2
         */
        use: ZoneUse;

        /**
         * The Vertices field shall be a list of vertices of type TwoDCartesianVertexStruct. These vertices define a
         * simple polygon on the TwoD Cartesian plane, which represents the bounds of the TwoD Cartesian Zone with an
         * implicit connection between the last and first list items.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.7.3
         */
        vertices: TwoDCartesianVertex[];

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
         * @see {@link MatterSpecification.v151.Cluster} § 2.14.5.7.4
         */
        color?: string;
    };

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Command metadata objects keyed by name.
     */
    export const commands: ClusterType.CommandObjects<Commands>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link ZoneManagement}.
     */
    export const Cluster: typeof ZoneManagement;

    /**
     * @deprecated Use {@link ZoneManagement}.
     */
    export const Complete: typeof ZoneManagement;

    export const Typing: ZoneManagement;
}

/**
 * @deprecated Use {@link ZoneManagement}.
 */
export declare const ZoneManagementCluster: typeof ZoneManagement;

export interface ZoneManagement extends ClusterTyping {
    Attributes: ZoneManagement.Attributes;
    Commands: ZoneManagement.Commands;
    Events: ZoneManagement.Events;
    Features: ZoneManagement.Features;
    Components: ZoneManagement.Components;
}
