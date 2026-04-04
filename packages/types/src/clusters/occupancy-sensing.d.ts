/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";

/**
 * Definitions for the OccupancySensing cluster.
 *
 * The server cluster provides an interface to occupancy sensing functionality based on one or more sensing modalities,
 * including configuration and provision of notifications of occupancy status.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 2.7
 */
export declare namespace OccupancySensing {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0406;

    /**
     * Textual cluster identifier.
     */
    export const name: "OccupancySensing";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 7;

    /**
     * Canonical metadata for the OccupancySensing cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link OccupancySensing} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates the sensed (processed) status of occupancy. For compatibility reasons this is expressed as a bitmap
         * where the status is indicated in bit 0: a value of 1 means occupied, and 0 means unoccupied, with the other
         * bits set to 0; this can be considered equivalent to a boolean.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.1
         */
        occupancy: Occupancy;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6
         */
        occupancySensorType: OccupancySensorType;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6
         */
        occupancySensorTypeBitmap: OccupancySensorTypeBitmap;

        /**
         * This attribute shall specify the time delay, in seconds, before the sensor changes to its unoccupied state
         * after the last detection of occupancy in the sensed area. This is equivalent to the legacy
         * *OccupiedToUnoccupiedDelay attributes.
         *
         * Low values of HoldTime SHOULD be avoided since they could lead to many reporting messages. A value 0 for
         * HoldTime shall NOT be used.
         *
         * The figure below illustrates this with an example of how this attribute is used for a PIR sensor. It uses
         * threshold detection to generate an "internal detection" signal, which needs post-processing to become usable
         * for transmission (traffic shaping). The bit in the Occupancy attribute will be set to 1 when the internal
         * detection signal goes high, and will stay at 1 for HoldTime after the (last) instance where the internal
         * detection signal goes low.
         *
         * The top half of the figure shows the case of a single trigger: the bit in the Occupancy attribute will be 1
         * for the duration of the PIR signal exceeding the threshold plus HoldTime. The bottom half of the figure shows
         * the case of multiple triggers: the second trigger starts before the HoldTime of the first trigger has
         * expired; this results in a single period of the bit in the Occupancy attribute being 1. The bit in the
         * Occupancy attribute will be set to 1 from the start of the first period where the PIR signal exceeds the
         * threshold until HoldTime after the last moment where the PIR exceeded the threshold.
         *
         * !HoldTime
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.3
         */
        holdTime?: number;

        /**
         * Indicates the server's limits, and default value, for the HoldTime attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.4
         */
        holdTimeLimits?: HoldTimeLimits;
    }

    /**
     * {@link OccupancySensing} supports these elements if it supports feature "PassiveInfrared".
     */
    export interface PassiveInfraredAttributes {
        /**
         * This attribute shall specify the time delay, in seconds, before the PIR sensor changes to its unoccupied
         * state after the last detection of occupancy in the sensed area.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.6
         */
        pirOccupiedToUnoccupiedDelay?: number;

        /**
         * This attribute shall specify the time delay, in seconds, before the PIR sensor changes to its occupied state
         * after the first detection of occupancy in the sensed area.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.7
         */
        pirUnoccupiedToOccupiedDelay?: number;

        /**
         * This attribute shall specify the number of occupancy detection events that must occur in the period
         * PIRUnoccupiedToOccupiedDelay, before the PIR sensor changes to its occupied state.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.8
         */
        pirUnoccupiedToOccupiedThreshold?: number;
    }

    /**
     * {@link OccupancySensing} supports these elements if it supports feature "Ultrasonic".
     */
    export interface UltrasonicAttributes {
        /**
         * This attribute shall specify the time delay, in seconds, before the Ultrasonic sensor changes to its
         * unoccupied state after the last detection of occupancy in the sensed area.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.9
         */
        ultrasonicOccupiedToUnoccupiedDelay?: number;

        /**
         * This attribute shall specify the time delay, in seconds, before the Ultrasonic sensor changes to its occupied
         * state after the first detection of occupancy in the sensed area.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.10
         */
        ultrasonicUnoccupiedToOccupiedDelay?: number;

        /**
         * This attribute shall specify the number of occupancy detection events that must occur in the period
         * UltrasonicUnoccupiedToOccupiedDelay, before the Ultrasonic sensor changes to its occupied state.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.11
         */
        ultrasonicUnoccupiedToOccupiedThreshold?: number;
    }

    /**
     * {@link OccupancySensing} supports these elements if it supports feature "PhysicalContact".
     */
    export interface PhysicalContactAttributes {
        /**
         * This attribute shall specify the time delay, in seconds, before the physical contact occupancy sensor changes
         * to its unoccupied state after detecting the unoccupied event.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.12
         */
        physicalContactOccupiedToUnoccupiedDelay?: number;

        /**
         * This attribute shall specify the time delay, in seconds, before the physical contact sensor changes to its
         * occupied state after the first detection of the occupied event.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.13
         */
        physicalContactUnoccupiedToOccupiedDelay?: number;

        /**
         * This attribute shall specify the number of occupancy detection events that must occur in the period
         * PhysicalContactUnoccupiedToOccupiedDelay, before the PhysicalContact sensor changes to its occupied state.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.14
         */
        physicalContactUnoccupiedToOccupiedThreshold?: number;
    }

    /**
     * Attributes that may appear in {@link OccupancySensing}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the sensed (processed) status of occupancy. For compatibility reasons this is expressed as a bitmap
         * where the status is indicated in bit 0: a value of 1 means occupied, and 0 means unoccupied, with the other
         * bits set to 0; this can be considered equivalent to a boolean.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.1
         */
        occupancy: Occupancy;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6
         */
        occupancySensorType: OccupancySensorType;

        /**
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6
         */
        occupancySensorTypeBitmap: OccupancySensorTypeBitmap;

        /**
         * This attribute shall specify the time delay, in seconds, before the sensor changes to its unoccupied state
         * after the last detection of occupancy in the sensed area. This is equivalent to the legacy
         * *OccupiedToUnoccupiedDelay attributes.
         *
         * Low values of HoldTime SHOULD be avoided since they could lead to many reporting messages. A value 0 for
         * HoldTime shall NOT be used.
         *
         * The figure below illustrates this with an example of how this attribute is used for a PIR sensor. It uses
         * threshold detection to generate an "internal detection" signal, which needs post-processing to become usable
         * for transmission (traffic shaping). The bit in the Occupancy attribute will be set to 1 when the internal
         * detection signal goes high, and will stay at 1 for HoldTime after the (last) instance where the internal
         * detection signal goes low.
         *
         * The top half of the figure shows the case of a single trigger: the bit in the Occupancy attribute will be 1
         * for the duration of the PIR signal exceeding the threshold plus HoldTime. The bottom half of the figure shows
         * the case of multiple triggers: the second trigger starts before the HoldTime of the first trigger has
         * expired; this results in a single period of the bit in the Occupancy attribute being 1. The bit in the
         * Occupancy attribute will be set to 1 from the start of the first period where the PIR signal exceeds the
         * threshold until HoldTime after the last moment where the PIR exceeded the threshold.
         *
         * !HoldTime
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.3
         */
        holdTime: number;

        /**
         * Indicates the server's limits, and default value, for the HoldTime attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.4
         */
        holdTimeLimits: HoldTimeLimits;

        /**
         * This attribute shall specify the time delay, in seconds, before the PIR sensor changes to its unoccupied
         * state after the last detection of occupancy in the sensed area.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.6
         */
        pirOccupiedToUnoccupiedDelay: number;

        /**
         * This attribute shall specify the time delay, in seconds, before the PIR sensor changes to its occupied state
         * after the first detection of occupancy in the sensed area.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.7
         */
        pirUnoccupiedToOccupiedDelay: number;

        /**
         * This attribute shall specify the number of occupancy detection events that must occur in the period
         * PIRUnoccupiedToOccupiedDelay, before the PIR sensor changes to its occupied state.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.8
         */
        pirUnoccupiedToOccupiedThreshold: number;

        /**
         * This attribute shall specify the time delay, in seconds, before the Ultrasonic sensor changes to its
         * unoccupied state after the last detection of occupancy in the sensed area.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.9
         */
        ultrasonicOccupiedToUnoccupiedDelay: number;

        /**
         * This attribute shall specify the time delay, in seconds, before the Ultrasonic sensor changes to its occupied
         * state after the first detection of occupancy in the sensed area.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.10
         */
        ultrasonicUnoccupiedToOccupiedDelay: number;

        /**
         * This attribute shall specify the number of occupancy detection events that must occur in the period
         * UltrasonicUnoccupiedToOccupiedDelay, before the Ultrasonic sensor changes to its occupied state.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.11
         */
        ultrasonicUnoccupiedToOccupiedThreshold: number;

        /**
         * This attribute shall specify the time delay, in seconds, before the physical contact occupancy sensor changes
         * to its unoccupied state after detecting the unoccupied event.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.12
         */
        physicalContactOccupiedToUnoccupiedDelay: number;

        /**
         * This attribute shall specify the time delay, in seconds, before the physical contact sensor changes to its
         * occupied state after the first detection of the occupied event.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.13
         */
        physicalContactUnoccupiedToOccupiedDelay: number;

        /**
         * This attribute shall specify the number of occupancy detection events that must occur in the period
         * PhysicalContactUnoccupiedToOccupiedDelay, before the PhysicalContact sensor changes to its occupied state.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.6.14
         */
        physicalContactUnoccupiedToOccupiedThreshold: number;
    }

    /**
     * {@link OccupancySensing} always supports these elements.
     */
    export interface BaseEvents {
        /**
         * If this event is supported, it shall be generated when the Occupancy attribute changes.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.7.1
         */
        occupancyChanged?: OccupancyChangedEvent;
    }

    /**
     * Events that may appear in {@link OccupancySensing}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
        /**
         * If this event is supported, it shall be generated when the Occupancy attribute changes.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.7.1
         */
        occupancyChanged: OccupancyChangedEvent;
    }

    export type Components = [
        { flags: {}, attributes: BaseAttributes, events: BaseEvents },
        { flags: { passiveInfrared: true }, attributes: PassiveInfraredAttributes },
        { flags: { ultrasonic: true }, attributes: UltrasonicAttributes },
        { flags: { physicalContact: true }, attributes: PhysicalContactAttributes }
    ];

    export type Features = "Other" | "PassiveInfrared" | "Ultrasonic" | "PhysicalContact" | "ActiveInfrared" | "Radar" | "RfSensing" | "Vision";

    /**
     * These are optional features supported by OccupancySensingCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.7.4
     */
    export enum Feature {
        /**
         * Other (OTHER)
         *
         * Supports sensing using a modality not listed in the other bits
         */
        Other = "Other",

        /**
         * PassiveInfrared (PIR)
         *
         * Supports sensing using PIR (Passive InfraRed)
         */
        PassiveInfrared = "PassiveInfrared",

        /**
         * Ultrasonic (US)
         *
         * Supports sensing using UltraSound
         */
        Ultrasonic = "Ultrasonic",

        /**
         * PhysicalContact (PHY)
         *
         * Supports sensing using a physical contact
         */
        PhysicalContact = "PhysicalContact",

        /**
         * ActiveInfrared (AIR)
         *
         * Supports sensing using Active InfraRed measurement (e.g. time-of-flight or transflective/reflective IR
         * sensing)
         */
        ActiveInfrared = "ActiveInfrared",

        /**
         * Radar (RAD)
         *
         * Supports sensing using radar waves (microwave)
         */
        Radar = "Radar",

        /**
         * RfSensing (RFS)
         *
         * Supports sensing using analysis of radio signals, e.g.: RSSI, CSI and/or any other metric from the signal
         */
        RfSensing = "RfSensing",

        /**
         * Vision (VIS)
         *
         * Supports sensing based on analyzing images
         */
        Vision = "Vision"
    }

    /**
     * @see {@link MatterSpecification.v151.Cluster} § 2.7.5.1
     */
    export declare class Occupancy {
        constructor(values?: Partial<Occupancy> | number);

        /**
         * Indicates the sensed occupancy state
         *
         * If this bit is set, it shall indicate the occupied state else if the bit if not set, it shall indicate the
         * unoccupied state.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.5.1.1
         */
        occupied?: boolean;
    };

    /**
     * > [!NOTE]
     *
     * > NOTE: This enum is as defined in ClusterRevision 4 and its definition shall NOT be extended; the feature flags
     *   provide the sensor modality (or modalities) for later cluster revisions. See Backward Compatibility section.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.7.5.3
     */
    export enum OccupancySensorType {
        /**
         * Indicates a passive infrared sensor.
         */
        Pir = 0,

        /**
         * Indicates a ultrasonic sensor.
         */
        Ultrasonic = 1,

        /**
         * Indicates a passive infrared and ultrasonic sensor.
         */
        PirAndUltrasonic = 2,

        /**
         * Indicates a physical contact sensor.
         */
        PhysicalContact = 3
    }

    /**
     * > [!NOTE]
     *
     * > NOTE: This enum is as defined in ClusterRevision 4 and its definition shall NOT be extended; the feature flags
     *   provide the sensor modality (or modalities) for later cluster revisions. See Backward Compatibility section.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.7.5.2
     */
    export declare class OccupancySensorTypeBitmap {
        constructor(values?: Partial<OccupancySensorTypeBitmap> | number);

        /**
         * Indicates a passive infrared sensor.
         */
        pir?: boolean;

        /**
         * Indicates a ultrasonic sensor.
         */
        ultrasonic?: boolean;

        /**
         * Indicates a physical contact sensor.
         */
        physicalContact?: boolean;
    };

    /**
     * This structure provides information on the server's supported values for the HoldTime attribute.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.7.5.4
     */
    export declare class HoldTimeLimits {
        constructor(values?: Partial<HoldTimeLimits>);

        /**
         * This field shall specify the minimum value of the server's supported value for the HoldTime attribute, in
         * seconds.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.5.4.1
         */
        holdTimeMin: number;

        /**
         * This field shall specify the maximum value of the server's supported value for the HoldTime attribute, in
         * seconds.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.5.4.2
         */
        holdTimeMax: number;

        /**
         * This field shall specify the (manufacturer-determined) default value of the server's HoldTime attribute, in
         * seconds. This is the value that a client who wants to reset the settings to a valid default SHOULD use.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.5.4.3
         */
        holdTimeDefault: number;
    };

    /**
     * If this event is supported, it shall be generated when the Occupancy attribute changes.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.7.7.1
     */
    export declare class OccupancyChangedEvent {
        constructor(values?: Partial<OccupancyChangedEvent>);

        /**
         * This field shall indicate the new value of the Occupancy attribute.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.7.7.1.1
         */
        occupancy: Occupancy;
    };

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Event metadata objects keyed by name.
     */
    export const events: ClusterType.EventObjects<Events>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link OccupancySensing}.
     */
    export const Cluster: typeof OccupancySensing;

    /**
     * @deprecated Use {@link OccupancySensing}.
     */
    export const Complete: typeof OccupancySensing;

    export const Typing: OccupancySensing;
}

/**
 * @deprecated Use {@link OccupancySensing}.
 */
export declare const OccupancySensingCluster: typeof OccupancySensing;

export interface OccupancySensing extends ClusterTyping {
    Attributes: OccupancySensing.Attributes;
    Events: OccupancySensing.Events;
    Features: OccupancySensing.Features;
    Components: OccupancySensing.Components;
}
