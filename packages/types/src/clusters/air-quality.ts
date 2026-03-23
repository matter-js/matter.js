/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClusterNamespace, ClusterTyping } from "../cluster/ClusterNamespace.js";
import { AirQuality as AirQualityModel } from "@matter/model";
import { ClusterId } from "../datatype/ClusterId.js";

/**
 * Definitions for the AirQuality cluster.
 */
export namespace AirQuality {
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

    /**
     * Attributes that may appear in {@link AirQuality}.
     *
     * Device support for attributes may be affected by a device's supported {@link Features}.
     */
    export interface Attributes {
        /**
         * Indicates a value from AirQualityEnum that is indicative of the currently measured air quality.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 2.9.6.1
         */
        readonly airQuality: AirQualityEnum;
    }

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

    export const id = ClusterId(0x5b);
    export const name = "AirQuality" as const;
    export const revision = 1;
    export const schema = AirQualityModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export type Cluster = typeof AirQuality;
    export declare const Cluster: Cluster;

    /**
     * @deprecated Use the cluster namespace directly (e.g. `AirQuality` instead of `AirQuality.Complete`)
     */
    export type Complete = typeof AirQuality;

    export declare const Complete: Complete;
    export declare const Typing: AirQuality;
}

ClusterNamespace.define(AirQuality);
export type AirQualityCluster = AirQuality.Cluster;
export const AirQualityCluster = AirQuality.Cluster;
export interface AirQuality extends ClusterTyping { Attributes: AirQuality.Attributes; Features: AirQuality.Features; Components: AirQuality.Components }
