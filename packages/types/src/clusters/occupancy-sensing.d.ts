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
    export const revision: 5;

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
        occupancy: Occupancy;
        occupancySensorType: OccupancySensorType;
        occupancySensorTypeBitmap: OccupancySensorTypeBitmap;
        holdTime?: number;
        holdTimeLimits?: HoldTimeLimits;
    }

    /**
     * {@link OccupancySensing} supports these elements if it supports feature "PassiveInfrared".
     */
    export interface PassiveInfraredAttributes {
        pirOccupiedToUnoccupiedDelay?: number;
        pirUnoccupiedToOccupiedDelay?: number;
        pirUnoccupiedToOccupiedThreshold?: number;
    }

    /**
     * {@link OccupancySensing} supports these elements if it supports feature "Ultrasonic".
     */
    export interface UltrasonicAttributes {
        ultrasonicOccupiedToUnoccupiedDelay?: number;
        ultrasonicUnoccupiedToOccupiedDelay?: number;
        ultrasonicUnoccupiedToOccupiedThreshold?: number;
    }

    /**
     * {@link OccupancySensing} supports these elements if it supports feature "PhysicalContact".
     */
    export interface PhysicalContactAttributes {
        physicalContactOccupiedToUnoccupiedDelay?: number;
        physicalContactUnoccupiedToOccupiedDelay?: number;
        physicalContactUnoccupiedToOccupiedThreshold?: number;
    }

    /**
     * Attributes that may appear in {@link OccupancySensing}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        occupancy: Occupancy;
        occupancySensorType: OccupancySensorType;
        occupancySensorTypeBitmap: OccupancySensorTypeBitmap;
        holdTime: number;
        holdTimeLimits: HoldTimeLimits;
        pirOccupiedToUnoccupiedDelay: number;
        pirUnoccupiedToOccupiedDelay: number;
        pirUnoccupiedToOccupiedThreshold: number;
        ultrasonicOccupiedToUnoccupiedDelay: number;
        ultrasonicUnoccupiedToOccupiedDelay: number;
        ultrasonicUnoccupiedToOccupiedThreshold: number;
        physicalContactOccupiedToUnoccupiedDelay: number;
        physicalContactUnoccupiedToOccupiedDelay: number;
        physicalContactUnoccupiedToOccupiedThreshold: number;
    }

    /**
     * {@link OccupancySensing} always supports these elements.
     */
    export interface BaseEvents {
        occupancyChanged?: OccupancyChangedEvent;
    }

    /**
     * Events that may appear in {@link OccupancySensing}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Events {
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

    export interface Occupancy {
        occupied?: boolean;
    }

    export enum OccupancySensorType {
        Pir = 0,
        Ultrasonic = 1,
        PirAndUltrasonic = 2,
        PhysicalContact = 3
    }

    export interface OccupancySensorTypeBitmap {
        pir?: boolean;
        ultrasonic?: boolean;
        physicalContact?: boolean;
    }
    export interface HoldTimeLimits {
        holdTimeMin: number;
        holdTimeMax: number;
        holdTimeDefault: number;
    }
    export interface OccupancyChangedEvent {
        occupancy: Occupancy;
    }

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
