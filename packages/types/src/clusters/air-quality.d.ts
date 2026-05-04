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
 * Definitions for the AirQuality cluster.
 *
 * This cluster provides an interface to air quality classification using distinct levels with human-readable labels.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 2.9
 */
export declare namespace AirQuality {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x005b;

    /**
     * Textual cluster identifier.
     */
    export const name: "AirQuality";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the AirQuality cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link AirQuality} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * Indicates a value from AirQualityEnum that is indicative of the currently measured air quality.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.9.6.1
         */
        airQuality: AirQualityEnum;
    }

    /**
     * Attributes that may appear in {@link AirQuality}.
     *
     * Some properties may be optional if device support is not mandatory. Device support may also be affected by a
     * device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates a value from AirQualityEnum that is indicative of the currently measured air quality.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 2.9.6.1
         */
        airQuality: AirQualityEnum;
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes }];
    export type Features = "Fair" | "Moderate" | "VeryPoor" | "ExtremelyPoor";

    /**
     * These are optional features supported by AirQualityCluster.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.9.4
     */
    export enum Feature {
        /**
         * Fair (FAIR)
         *
         * Cluster supports the Fair air quality level
         */
        Fair = "Fair",

        /**
         * Moderate (MOD)
         *
         * Cluster supports the Moderate air quality level
         */
        Moderate = "Moderate",

        /**
         * VeryPoor (VPOOR)
         *
         * Cluster supports the Very poor air quality level
         */
        VeryPoor = "VeryPoor",

        /**
         * ExtremelyPoor (XPOOR)
         *
         * Cluster supports the Extremely poor air quality level
         */
        ExtremelyPoor = "ExtremelyPoor"
    }

    /**
     * The AirQualityEnum provides a representation of the quality of the analyzed air. It is up to the device
     * manufacturer to determine the mapping between the measured values and their corresponding enumeration values.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 2.9.5.1
     */
    export enum AirQualityEnum {
        /**
         * The air quality is unknown.
         */
        Unknown = 0,

        /**
         * The air quality is good.
         */
        Good = 1,

        /**
         * The air quality is fair.
         */
        Fair = 2,

        /**
         * The air quality is moderate.
         */
        Moderate = 3,

        /**
         * The air quality is poor.
         */
        Poor = 4,

        /**
         * The air quality is very poor.
         */
        VeryPoor = 5,

        /**
         * The air quality is extremely poor.
         */
        ExtremelyPoor = 6
    }

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * Feature metadata objects keyed by name.
     */
    export const features: ClusterType.Features<Features>;

    /**
     * @deprecated Use {@link AirQuality}.
     */
    export const Cluster: ClusterType.WithCompat<typeof AirQuality, AirQuality>;

    /**
     * @deprecated Use {@link AirQuality}.
     */
    export const Complete: typeof AirQuality;

    export const Typing: AirQuality;
}

/**
 * @deprecated Use {@link AirQuality}.
 */
export declare const AirQualityCluster: typeof AirQuality;

export interface AirQuality extends ClusterTyping {
    Attributes: AirQuality.Attributes;
    Features: AirQuality.Features;
    Components: AirQuality.Components;
}
