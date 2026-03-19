/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
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
import { AccessLevel } from "@matter/model";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { Priority } from "../globals/Priority.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace OccupancySensing {
    /**
     * These are optional features supported by OccupancySensingCluster.
     */
    export enum Feature {
        /**
         * Other (OTHER)
         */
        Other = "Other",

        /**
         * PassiveInfrared (PIR)
         */
        PassiveInfrared = "PassiveInfrared",

        /**
         * Ultrasonic (US)
         */
        Ultrasonic = "Ultrasonic",

        /**
         * PhysicalContact (PHY)
         */
        PhysicalContact = "PhysicalContact",

        /**
         * ActiveInfrared (AIR)
         */
        ActiveInfrared = "ActiveInfrared",

        /**
         * Radar (RAD)
         */
        Radar = "Radar",

        /**
         * RfSensing (RFS)
         */
        RfSensing = "RfSensing",

        /**
         * Vision (VIS)
         */
        Vision = "Vision"
    }

    export const Occupancy = { occupied: BitFlag(0) };

    export enum OccupancySensorType {
        Pir = 0,
        Ultrasonic = 1,
        PirAndUltrasonic = 2,
        PhysicalContact = 3
    }

    export const OccupancySensorTypeBitmap = { pir: BitFlag(0), ultrasonic: BitFlag(1), physicalContact: BitFlag(2) };
    export const TlvHoldTimeLimits = TlvObject({
        holdTimeMin: TlvField(0, TlvUInt16.bound({ min: 1 })),
        holdTimeMax: TlvField(1, TlvUInt16),
        holdTimeDefault: TlvField(2, TlvUInt16)
    });
    export interface HoldTimeLimits extends TypeFromSchema<typeof TlvHoldTimeLimits> {}

    /**
     * Body of the OccupancySensing occupancyChanged event
     */
    export const TlvOccupancyChangedEvent = TlvObject({ occupancy: TlvField(0, TlvBitmap(TlvUInt8, Occupancy)) });

    /**
     * Body of the OccupancySensing occupancyChanged event
     */
    export interface OccupancyChangedEvent extends TypeFromSchema<typeof TlvOccupancyChangedEvent> {}

    /**
     * A OccupancySensingCluster supports these elements if it supports feature PassiveInfrared.
     */
    export const PassiveInfraredComponent = MutableCluster.Component({
        attributes: {
            pirOccupiedToUnoccupiedDelay: OptionalWritableAttribute(
                0x10,
                TlvUInt16,
                { persistent: true, default: 0, writeAcl: AccessLevel.Manage }
            ),
            pirUnoccupiedToOccupiedDelay: OptionalWritableAttribute(
                0x11,
                TlvUInt16,
                { persistent: true, default: 0, writeAcl: AccessLevel.Manage }
            ),
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
            ultrasonicOccupiedToUnoccupiedDelay: OptionalWritableAttribute(
                0x20,
                TlvUInt16,
                { persistent: true, default: 0, writeAcl: AccessLevel.Manage }
            ),
            ultrasonicUnoccupiedToOccupiedDelay: OptionalWritableAttribute(
                0x21,
                TlvUInt16,
                { persistent: true, default: 0, writeAcl: AccessLevel.Manage }
            ),
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
            physicalContactOccupiedToUnoccupiedDelay: OptionalWritableAttribute(
                0x30,
                TlvUInt16,
                { persistent: true, default: 0, writeAcl: AccessLevel.Manage }
            ),
            physicalContactUnoccupiedToOccupiedDelay: OptionalWritableAttribute(
                0x31,
                TlvUInt16,
                { persistent: true, default: 0, writeAcl: AccessLevel.Manage }
            ),
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
            other: BitFlag(0),
            passiveInfrared: BitFlag(1),
            ultrasonic: BitFlag(2),
            physicalContact: BitFlag(3),
            activeInfrared: BitFlag(4),
            radar: BitFlag(5),
            rfSensing: BitFlag(6),
            vision: BitFlag(7)
        },

        attributes: {
            occupancy: Attribute(0x0, TlvBitmap(TlvUInt8, Occupancy)),
            occupancySensorType: FixedAttribute(0x1, TlvEnum<OccupancySensorType>()),
            occupancySensorTypeBitmap: FixedAttribute(0x2, TlvBitmap(TlvUInt8, OccupancySensorTypeBitmap)),
            holdTime: OptionalWritableAttribute(0x3, TlvUInt16, { persistent: true, writeAcl: AccessLevel.Manage }),
            holdTimeLimits: OptionalFixedAttribute(0x4, TlvHoldTimeLimits)
        },

        events: { occupancyChanged: OptionalEvent(0x0, Priority.Info, TlvOccupancyChangedEvent) },

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
     * Per the Matter specification you cannot use {@link OccupancySensingCluster} without enabling certain feature
     * combinations. You must use the {@link with} factory method to obtain a working cluster.
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
