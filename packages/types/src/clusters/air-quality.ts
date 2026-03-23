/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { Attribute } from "../cluster/Cluster.js";
import { TlvEnum } from "../tlv/TlvNumber.js";
import { Identity } from "@matter/general";
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

    /**
     * These elements and properties are present in all AirQuality clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0x5b,
        name: "AirQuality",
        revision: 1,

        features: {
            /**
             * Cluster supports the Fair air quality level
             */
            fair: BitFlag(0),

            /**
             * Cluster supports the Moderate air quality level
             */
            moderate: BitFlag(1),

            /**
             * Cluster supports the Very poor air quality level
             */
            veryPoor: BitFlag(2),

            /**
             * Cluster supports the Extremely poor air quality level
             */
            extremelyPoor: BitFlag(3)
        },

        attributes: {
            /**
             * Indicates a value from AirQualityEnum that is indicative of the currently measured air quality.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 2.9.6.1
             */
            airQuality: Attribute(0x0, TlvEnum<AirQualityEnum>())
        },

        /**
         * This metadata controls which AirQualityCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions()
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This cluster provides an interface to air quality classification using distinct levels with human-readable
     * labels.
     *
     * AirQualityCluster supports optional features that you can enable with the AirQualityCluster.with() factory
     * method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.9
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
    export const id = ClusterId(0x5b);
    export const name = "AirQuality" as const;
    export const revision = 1;
    export const schema = AirQualityModel;
    export interface AttributeObjects extends ClusterNamespace.AttributeObjects<Attributes> {}
    export declare const attributes: AttributeObjects;
    export declare const features: ClusterNamespace.Features<Features>;
    export declare const Typing: AirQuality;
}

export type AirQualityCluster = AirQuality.Cluster;
export const AirQualityCluster = AirQuality.Cluster;
ClusterNamespace.define(AirQuality);
export interface AirQuality extends ClusterTyping { Attributes: AirQuality.Attributes; Features: AirQuality.Features; Components: AirQuality.Components }
