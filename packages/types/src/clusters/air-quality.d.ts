/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import type { AirQuality as AirQualityModel } from "@matter/model";
import type { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the AirQuality cluster.
 */
export declare namespace AirQuality {
    /**
     * {@link AirQuality} always supports these elements.
     */
    export namespace Base {
        export interface Attributes {
            /**
             * Indicates a value from AirQualityEnum that is indicative of the currently measured air quality.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.9.6.1
             */
            readonly airQuality: AirQualityEnum;
        }
    }

    export interface Attributes extends Base.Attributes {}
    export type Components = [{ flags: {}, attributes: Base.Attributes }];
    export type Features = "Fair" | "Moderate" | "VeryPoor" | "ExtremelyPoor";

    /**
     * These are optional features supported by AirQualityCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.9.4
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
     * @see {@link MatterSpecification.v142.Cluster} § 2.9.5.1
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

    export const id: ClusterId;
    export const name: "AirQuality";
    export const revision: 1;
    export const schema: typeof AirQualityModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export const attributes: AttributeObjects;
    export const features: ClusterNamespace.Features<Features>;
    export const Cluster: typeof AirQuality;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `AirQuality` instead of `AirQuality.Complete`)
     */
    export const Complete: typeof AirQuality;

    export const Typing: AirQuality;
}

export declare const AirQualityCluster: typeof AirQuality;
export interface AirQuality extends ClusterTyping { Attributes: AirQuality.Attributes; Features: AirQuality.Features; Components: AirQuality.Components }
