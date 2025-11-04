/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import {
    OptionalWritableAttribute,
    Attribute,
    FixedAttribute,
    OptionalFixedAttribute,
    OptionalEvent
} from "../cluster/Cluster.js";
import { TlvUInt16, TlvUInt8, TlvBitmap, TlvEnum } from "../tlv/TlvNumber.js";
import { AccessLevel } from "#model";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace OccupancySensing {
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
    export const Occupancy = {
        /**
         * Indicates the sensed occupancy state
         *
         * If this bit is set, it shall indicate the occupied state else if the bit if not set, it shall indicate the
         * unoccupied state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.1.1
         */
        occupied: BitFlag(0)
    };

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
    export const OccupancySensorTypeBitmap = {
        /**
         * Indicates a passive infrared sensor.
         */
        pir: BitFlag(0),

        /**
         * Indicates a ultrasonic sensor.
         */
        ultrasonic: BitFlag(1),

        /**
         * Indicates a physical contact sensor.
         */
        physicalContact: BitFlag(2)
    };

    /**
     * This structure provides information on the server’s supported values for the HoldTime attribute.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.4
     */
    export const TlvHoldTimeLimits = TlvObject({
        /**
         * This field shall specify the minimum value of the server’s supported value for the HoldTime attribute, in
         * seconds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.4.1
         */
        holdTimeMin: TlvField(0, TlvUInt16.bound({ min: 1 })),

        /**
         * This field shall specify the maximum value of the server’s supported value for the HoldTime attribute, in
         * seconds.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.4.2
         */
        holdTimeMax: TlvField(1, TlvUInt16),

        /**
         * This field shall specify the (manufacturer-determined) default value of the server’s HoldTime attribute, in
         * seconds. This is the value that a client who wants to reset the settings to a valid default SHOULD use.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.4.3
         */
        holdTimeDefault: TlvField(2, TlvUInt16)
    });

    /**
     * This structure provides information on the server’s supported values for the HoldTime attribute.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.4
     */
    export interface HoldTimeLimits extends TypeFromSchema<typeof TlvHoldTimeLimits> {}

    /**
     * Body of the OccupancySensing occupancyChanged event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.7.7.1
     */
    export const TlvOccupancyChangedEvent = TlvObject({
        /**
         * This field shall indicate the new value of the Occupancy attribute.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.7.7.1.1
         */
        occupancy: TlvField(0, TlvBitmap(TlvUInt8, Occupancy))
    });

    /**
     * Body of the OccupancySensing occupancyChanged event
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.7.7.1
     */
    export interface OccupancyChangedEvent extends TypeFromSchema<typeof TlvOccupancyChangedEvent> {}

    /**
     * A OccupancySensingCluster supports these elements if it supports feature PassiveInfrared.
     */
    export const PassiveInfraredComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute shall specify the time delay, in seconds, before the PIR sensor changes to its unoccupied
             * state after the last detection of occupancy in the sensed area.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.6
             */
            pirOccupiedToUnoccupiedDelay: OptionalWritableAttribute(
                0x10,
                TlvUInt16,
                { persistent: true, default: 0, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute shall specify the time delay, in seconds, before the PIR sensor changes to its occupied
             * state after the first detection of occupancy in the sensed area.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.7
             */
            pirUnoccupiedToOccupiedDelay: OptionalWritableAttribute(
                0x11,
                TlvUInt16,
                { persistent: true, default: 0, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute shall specify the number of occupancy detection events that must occur in the period
             * PIRUnoccupiedToOccupiedDelay, before the PIR sensor changes to its occupied state.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.8
             */
            pirUnoccupiedToOccupiedThreshold: OptionalWritableAttribute(
                0x12,
                TlvUInt8.bound({ min: 1, max: 254 }),
                { persistent: true, default: 1, writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * A OccupancySensingCluster supports these elements if it supports feature Ultrasonic.
     */
    export const UltrasonicComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute shall specify the time delay, in seconds, before the Ultrasonic sensor changes to its
             * unoccupied state after the last detection of occupancy in the sensed area.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.9
             */
            ultrasonicOccupiedToUnoccupiedDelay: OptionalWritableAttribute(
                0x20,
                TlvUInt16,
                { persistent: true, default: 0, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute shall specify the time delay, in seconds, before the Ultrasonic sensor changes to its
             * occupied state after the first detection of occupancy in the sensed area.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.10
             */
            ultrasonicUnoccupiedToOccupiedDelay: OptionalWritableAttribute(
                0x21,
                TlvUInt16,
                { persistent: true, default: 0, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute shall specify the number of occupancy detection events that must occur in the period
             * UltrasonicUnoccupiedToOccupiedDelay, before the Ultrasonic sensor changes to its occupied state.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.11
             */
            ultrasonicUnoccupiedToOccupiedThreshold: OptionalWritableAttribute(
                0x22,
                TlvUInt8.bound({ min: 1, max: 254 }),
                { persistent: true, default: 1, writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * A OccupancySensingCluster supports these elements if it supports feature PhysicalContact.
     */
    export const PhysicalContactComponent = MutableCluster.Component({
        attributes: {
            /**
             * This attribute shall specify the time delay, in seconds, before the physical contact occupancy sensor
             * changes to its unoccupied state after detecting the unoccupied event.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.12
             */
            physicalContactOccupiedToUnoccupiedDelay: OptionalWritableAttribute(
                0x30,
                TlvUInt16,
                { persistent: true, default: 0, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute shall specify the time delay, in seconds, before the physical contact sensor changes to
             * its occupied state after the first detection of the occupied event.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.13
             */
            physicalContactUnoccupiedToOccupiedDelay: OptionalWritableAttribute(
                0x31,
                TlvUInt16,
                { persistent: true, default: 0, writeAcl: AccessLevel.Manage }
            ),

            /**
             * This attribute shall specify the number of occupancy detection events that must occur in the period
             * PhysicalContactUnoccupiedToOccupiedDelay, before the PhysicalContact sensor changes to its occupied
             * state.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.14
             */
            physicalContactUnoccupiedToOccupiedThreshold: OptionalWritableAttribute(
                0x32,
                TlvUInt8.bound({ min: 1, max: 254 }),
                { persistent: true, default: 1, writeAcl: AccessLevel.Manage }
            )
        }
    });

    /**
     * These elements and properties are present in all OccupancySensing clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x406,
        name: "OccupancySensing",
        revision: 5,

        features: {
            /**
             * Supports sensing using a modality not listed in the other bits
             */
            other: BitFlag(0),

            /**
             * Supports sensing using PIR (Passive InfraRed)
             */
            passiveInfrared: BitFlag(1),

            /**
             * Supports sensing using UltraSound
             */
            ultrasonic: BitFlag(2),

            /**
             * Supports sensing using a physical contact
             */
            physicalContact: BitFlag(3),

            /**
             * Supports sensing using Active InfraRed measurement (e.g. time-of-flight or transflective/reflective IR
             * sensing)
             */
            activeInfrared: BitFlag(4),

            /**
             * Supports sensing using radar waves (microwave)
             */
            radar: BitFlag(5),

            /**
             * Supports sensing using analysis of radio signals, e.g.: RSSI, CSI and/or any other metric from the signal
             */
            rfSensing: BitFlag(6),

            /**
             * Supports sensing based on analyzing images
             */
            vision: BitFlag(7)
        },

        attributes: {
            /**
             * Indicates the sensed (processed) status of occupancy. For compatibility reasons this is expressed as a
             * bitmap where the status is indicated in bit 0: a value of 1 means occupied, and 0 means unoccupied, with
             * the other bits set to 0; this can be considered equivalent to a boolean.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.1
             */
            occupancy: Attribute(0x0, TlvBitmap(TlvUInt8, Occupancy)),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6
             */
            occupancySensorType: FixedAttribute(0x1, TlvEnum<OccupancySensorType>()),

            /**
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6
             */
            occupancySensorTypeBitmap: FixedAttribute(0x2, TlvBitmap(TlvUInt8, OccupancySensorTypeBitmap)),

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
            holdTime: OptionalWritableAttribute(0x3, TlvUInt16, { persistent: true, writeAcl: AccessLevel.Manage }),

            /**
             * Indicates the server’s limits, and default value, for the HoldTime attribute.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.6.4
             */
            holdTimeLimits: OptionalFixedAttribute(0x4, TlvHoldTimeLimits)
        },

        events: {
            /**
             * If this event is supported, it shall be generated when the Occupancy attribute changes.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.7.7.1
             */
            occupancyChanged: OptionalEvent(0x0, Priority.Info, TlvOccupancyChangedEvent)
        },

        /**
         * This metadata controls which OccupancySensingCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions(
            { flags: { passiveInfrared: true }, component: PassiveInfraredComponent },
            { flags: { ultrasonic: true }, component: UltrasonicComponent },
            { flags: { physicalContact: true }, component: PhysicalContactComponent },

            {
                flags: {
                    other: false,
                    passiveInfrared: false,
                    ultrasonic: false,
                    physicalContact: false,
                    activeInfrared: false,
                    radar: false,
                    rfSensing: false,
                    vision: false
                },

                component: false
            }
        )
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster.ExtensibleOnly(Base);

    /**
     * The server cluster provides an interface to occupancy sensing functionality based on one or more sensing
     * modalities, including configuration and provision of notifications of occupancy status.
     *
     * Per the Matter specification you cannot use {@link OccupancySensingCluster} without enabling certain feature
     * combinations. You must use the {@link with} factory method to obtain a working cluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.7
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const PIR = { passiveInfrared: true };
    const US = { ultrasonic: true };
    const PHY = { physicalContact: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Base.id,
        name: Base.name,
        revision: Base.revision,
        features: Base.features,

        attributes: {
            ...Base.attributes,
            pirOccupiedToUnoccupiedDelay: MutableCluster.AsConditional(
                PassiveInfraredComponent.attributes.pirOccupiedToUnoccupiedDelay,
                { optionalIf: [PIR] }
            ),
            pirUnoccupiedToOccupiedDelay: MutableCluster.AsConditional(
                PassiveInfraredComponent.attributes.pirUnoccupiedToOccupiedDelay,
                { optionalIf: [PIR] }
            ),
            pirUnoccupiedToOccupiedThreshold: MutableCluster.AsConditional(
                PassiveInfraredComponent.attributes.pirUnoccupiedToOccupiedThreshold,
                { optionalIf: [PIR] }
            ),
            ultrasonicOccupiedToUnoccupiedDelay: MutableCluster.AsConditional(
                UltrasonicComponent.attributes.ultrasonicOccupiedToUnoccupiedDelay,
                { optionalIf: [US] }
            ),
            ultrasonicUnoccupiedToOccupiedDelay: MutableCluster.AsConditional(
                UltrasonicComponent.attributes.ultrasonicUnoccupiedToOccupiedDelay,
                { optionalIf: [US] }
            ),
            ultrasonicUnoccupiedToOccupiedThreshold: MutableCluster.AsConditional(
                UltrasonicComponent.attributes.ultrasonicUnoccupiedToOccupiedThreshold,
                { optionalIf: [US] }
            ),
            physicalContactOccupiedToUnoccupiedDelay: MutableCluster.AsConditional(
                PhysicalContactComponent.attributes.physicalContactOccupiedToUnoccupiedDelay,
                { optionalIf: [PHY] }
            ),
            physicalContactUnoccupiedToOccupiedDelay: MutableCluster.AsConditional(
                PhysicalContactComponent.attributes.physicalContactUnoccupiedToOccupiedDelay,
                { optionalIf: [PHY] }
            ),
            physicalContactUnoccupiedToOccupiedThreshold: MutableCluster.AsConditional(
                PhysicalContactComponent.attributes.physicalContactUnoccupiedToOccupiedThreshold,
                { optionalIf: [PHY] }
            )
        },

        events: Base.events
    });

    /**
     * This cluster supports all OccupancySensing features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type OccupancySensingCluster = OccupancySensing.Cluster;
export const OccupancySensingCluster = OccupancySensing.Cluster;
ClusterRegistry.register(OccupancySensing.Complete);
