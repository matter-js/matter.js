/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { OccupancySensing as OccupancySensingModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the OccupancySensing cluster.
 */
export namespace OccupancySensing {
    /**
     * {@link OccupancySensing} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates the sensed (processed) status of occupancy. For compatibility reasons this is expressed as a
             * bitmap where the status is indicated in bit 0: a value of 1 means occupied, and 0 means unoccupied, with
             * the other bits set to 0; this can be considered equivalent to a boolean.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.1
             */
            readonly occupancy: Occupancy;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6
             */
            readonly occupancySensorType: OccupancySensorType;

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6
             */
            readonly occupancySensorTypeBitmap: OccupancySensorTypeBitmap;

            /**
             * This attribute shall specify the time delay, in seconds, before the sensor changes to its unoccupied
             * state after the last detection of occupancy in the sensed area. This is equivalent to the legacy
             * *OccupiedToUnoccupiedDelay attributes.
             *
             * Low values of HoldTime SHOULD be avoided since they could lead to many reporting messages. A value 0 for
             * HoldTime shall NOT be used.
             *
             * The figure below illustrates this with an example of how this attribute is used for a PIR sensor. It uses
             * threshold detection to generate an "internal detection" signal, which needs post-processing to become
             * usable for transmission (traffic shaping). The bit in the Occupancy attribute will be set to 1 when the
             * internal detection signal goes high, and will stay at 1 for HoldTime after the (last) instance where the
             * internal detection signal goes low.
             *
             * The top half of the figure shows the case of a single trigger: the bit in the Occupancy attribute will be
             * 1 for the duration of the PIR signal exceeding the threshold plus HoldTime. The bottom half of the figure
             * shows the case of multiple triggers: the second trigger starts before the HoldTime of the first trigger
             * has expired; this results in a single period of the bit in the Occupancy attribute being 1. The bit in
             * the Occupancy attribute will be set to 1 from the start of the first period where the PIR signal exceeds
             * the threshold until HoldTime after the last moment where the PIR exceeded the threshold.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.3
             */
            holdTime?: number;

            /**
             * Indicates the server’s limits, and default value, for the HoldTime attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.4
             */
            readonly holdTimeLimits?: HoldTimeLimits;
        }

        export interface Events {
            /**
             * If this event is supported, it shall be generated when the Occupancy attribute changes.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.7.1
             */
            occupancyChanged?: OccupancyChangedEvent;
        }
    }

    /**
     * {@link OccupancySensing} supports these elements if it supports feature "PassiveInfrared".
     */
    export namespace PassiveInfraredComponent {
        export interface Attributes {
            /**
             * This attribute shall specify the time delay, in seconds, before the PIR sensor changes to its unoccupied
             * state after the last detection of occupancy in the sensed area.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.6
             */
            pirOccupiedToUnoccupiedDelay?: number;

            /**
             * This attribute shall specify the time delay, in seconds, before the PIR sensor changes to its occupied
             * state after the first detection of occupancy in the sensed area.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.7
             */
            pirUnoccupiedToOccupiedDelay?: number;

            /**
             * This attribute shall specify the number of occupancy detection events that must occur in the period
             * PIRUnoccupiedToOccupiedDelay, before the PIR sensor changes to its occupied state.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.8
             */
            pirUnoccupiedToOccupiedThreshold?: number;
        }
    }

    /**
     * {@link OccupancySensing} supports these elements if it supports feature "Ultrasonic".
     */
    export namespace UltrasonicComponent {
        export interface Attributes {
            /**
             * This attribute shall specify the time delay, in seconds, before the Ultrasonic sensor changes to its
             * unoccupied state after the last detection of occupancy in the sensed area.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.9
             */
            ultrasonicOccupiedToUnoccupiedDelay?: number;

            /**
             * This attribute shall specify the time delay, in seconds, before the Ultrasonic sensor changes to its
             * occupied state after the first detection of occupancy in the sensed area.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.10
             */
            ultrasonicUnoccupiedToOccupiedDelay?: number;

            /**
             * This attribute shall specify the number of occupancy detection events that must occur in the period
             * UltrasonicUnoccupiedToOccupiedDelay, before the Ultrasonic sensor changes to its occupied state.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.11
             */
            ultrasonicUnoccupiedToOccupiedThreshold?: number;
        }
    }

    /**
     * {@link OccupancySensing} supports these elements if it supports feature "PhysicalContact".
     */
    export namespace PhysicalContactComponent {
        export interface Attributes {
            /**
             * This attribute shall specify the time delay, in seconds, before the physical contact occupancy sensor
             * changes to its unoccupied state after detecting the unoccupied event.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.12
             */
            physicalContactOccupiedToUnoccupiedDelay?: number;

            /**
             * This attribute shall specify the time delay, in seconds, before the physical contact sensor changes to
             * its occupied state after the first detection of the occupied event.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.13
             */
            physicalContactUnoccupiedToOccupiedDelay?: number;

            /**
             * This attribute shall specify the number of occupancy detection events that must occur in the period
             * PhysicalContactUnoccupiedToOccupiedDelay, before the PhysicalContact sensor changes to its occupied
             * state.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.14
             */
            physicalContactUnoccupiedToOccupiedThreshold?: number;
        }
    }

    /**
     * Attributes that may appear in {@link OccupancySensing}.
     *
     * Optional properties represent attributes that devices are not required to support. Device support for attributes
     * may also be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates the sensed (processed) status of occupancy. For compatibility reasons this is expressed as a bitmap
         * where the status is indicated in bit 0: a value of 1 means occupied, and 0 means unoccupied, with the other
         * bits set to 0; this can be considered equivalent to a boolean.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.1
         */
        readonly occupancy: Occupancy;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.6
         */
        readonly occupancySensorType: OccupancySensorType;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.6
         */
        readonly occupancySensorTypeBitmap: OccupancySensorTypeBitmap;

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
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.3
         */
        holdTime: number;

        /**
         * Indicates the server’s limits, and default value, for the HoldTime attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.4
         */
        readonly holdTimeLimits: HoldTimeLimits;

        /**
         * This attribute shall specify the time delay, in seconds, before the PIR sensor changes to its unoccupied
         * state after the last detection of occupancy in the sensed area.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.6
         */
        pirOccupiedToUnoccupiedDelay: number;

        /**
         * This attribute shall specify the time delay, in seconds, before the PIR sensor changes to its occupied state
         * after the first detection of occupancy in the sensed area.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.7
         */
        pirUnoccupiedToOccupiedDelay: number;

        /**
         * This attribute shall specify the number of occupancy detection events that must occur in the period
         * PIRUnoccupiedToOccupiedDelay, before the PIR sensor changes to its occupied state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.8
         */
        pirUnoccupiedToOccupiedThreshold: number;

        /**
         * This attribute shall specify the time delay, in seconds, before the Ultrasonic sensor changes to its
         * unoccupied state after the last detection of occupancy in the sensed area.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.9
         */
        ultrasonicOccupiedToUnoccupiedDelay: number;

        /**
         * This attribute shall specify the time delay, in seconds, before the Ultrasonic sensor changes to its occupied
         * state after the first detection of occupancy in the sensed area.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.10
         */
        ultrasonicUnoccupiedToOccupiedDelay: number;

        /**
         * This attribute shall specify the number of occupancy detection events that must occur in the period
         * UltrasonicUnoccupiedToOccupiedDelay, before the Ultrasonic sensor changes to its occupied state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.11
         */
        ultrasonicUnoccupiedToOccupiedThreshold: number;

        /**
         * This attribute shall specify the time delay, in seconds, before the physical contact occupancy sensor changes
         * to its unoccupied state after detecting the unoccupied event.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.12
         */
        physicalContactOccupiedToUnoccupiedDelay: number;

        /**
         * This attribute shall specify the time delay, in seconds, before the physical contact sensor changes to its
         * occupied state after the first detection of the occupied event.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.13
         */
        physicalContactUnoccupiedToOccupiedDelay: number;

        /**
         * This attribute shall specify the number of occupancy detection events that must occur in the period
         * PhysicalContactUnoccupiedToOccupiedDelay, before the PhysicalContact sensor changes to its occupied state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.14
         */
        physicalContactUnoccupiedToOccupiedThreshold: number;
    }

    /**
     * Events that may appear in {@link OccupancySensing}.
     *
     * Devices may not support all of these events. Device support for events may also be affected by a device's
     * supported {@link Features}.
     */
    export interface Events {
        /**
         * If this event is supported, it shall be generated when the Occupancy attribute changes.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.7.1
         */
        occupancyChanged: OccupancyChangedEvent;
    }

    export type Components = [
        { flags: {}, attributes: Base.Attributes, events: Base.Events },
        { flags: { passiveInfrared: true }, attributes: PassiveInfraredComponent.Attributes },
        { flags: { ultrasonic: true }, attributes: UltrasonicComponent.Attributes },
        { flags: { physicalContact: true }, attributes: PhysicalContactComponent.Attributes }
    ];

    export type Features = "Other" | "PassiveInfrared" | "Ultrasonic" | "PhysicalContact" | "ActiveInfrared" | "Radar" | "RfSensing" | "Vision";

    /**
     * These are optional features supported by OccupancySensingCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.7.4
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
     * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.1
     */
    export interface Occupancy {
        /**
         * Indicates the sensed occupancy state
         *
         * If this bit is set, it shall indicate the occupied state else if the bit if not set, it shall indicate the
         * unoccupied state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.1.1
         */
        occupied?: boolean;
    }

    /**
     * > [!NOTE]
     *
     * > This enum is as defined in ClusterRevision 4 and its definition shall NOT be extended; the feature flags
     *   provide the sensor modality (or modalities) for later cluster revisions. See Backward Compatibility section.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.3
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
     * > This enum is as defined in ClusterRevision 4 and its definition shall NOT be extended; the feature flags
     *   provide the sensor modality (or modalities) for later cluster revisions. See Backward Compatibility section.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.2
     */
    export interface OccupancySensorTypeBitmap {
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
    }

    /**
     * This structure provides information on the server’s supported values for the HoldTime attribute.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.4
     */
    export interface HoldTimeLimits {
        /**
         * This field shall specify the minimum value of the server’s supported value for the HoldTime attribute, in
         * seconds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.4.1
         */
        holdTimeMin: number;

        /**
         * This field shall specify the maximum value of the server’s supported value for the HoldTime attribute, in
         * seconds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.4.2
         */
        holdTimeMax: number;

        /**
         * This field shall specify the (manufacturer-determined) default value of the server’s HoldTime attribute, in
         * seconds. This is the value that a client who wants to reset the settings to a valid default SHOULD use.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.4.3
         */
        holdTimeDefault: number;
    }

    /**
     * If this event is supported, it shall be generated when the Occupancy attribute changes.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.7.7.1
     */
    export interface OccupancyChangedEvent {
        /**
         * This field shall indicate the new value of the Occupancy attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.7.1.1
         */
        occupancy: Occupancy;
    }

    export const id = ClusterId(0x406);
    export const name = "OccupancySensing" as const;
    export const revision = 5;
    export const schema = OccupancySensingModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export interface EventObjects extends ClusterNamespace.EventObjects<Events> {}
    export declare const events: EventObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof OccupancySensing;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `OccupancySensing` instead of `OccupancySensing.Complete`)
     */
    export type Complete = typeof OccupancySensing;

    export declare const Complete: Complete;
    export declare const Typing: OccupancySensing;
}

ClusterNamespace.define(OccupancySensing);
export type OccupancySensingCluster = OccupancySensing.Cluster;
export const OccupancySensingCluster = OccupancySensing.Cluster;
export interface OccupancySensing extends ClusterTyping { Attributes: OccupancySensing.Attributes; Events: OccupancySensing.Events; Features: OccupancySensing.Features; Components: OccupancySensing.Components }
