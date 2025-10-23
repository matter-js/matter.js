/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { Attribute } from "../cluster/Cluster.js";
import { TlvEnum } from "../tlv/TlvNumber.js";
import { Identity } from "#general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace AirQuality {
    /**
     * These are optional features supported by AirQualityCluster.
     *
     * @see {@link MatterSpecification.v141.Cluster} § 2.9.4
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
     * @see {@link MatterSpecification.v141.Cluster} § 2.9.5.1
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
             * @see {@link MatterSpecification.v141.Cluster} § 2.9.6.1
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
     * @see {@link MatterSpecification.v141.Cluster} § 2.9
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type AirQualityCluster = AirQuality.Cluster;
export const AirQualityCluster = AirQuality.Cluster;
ClusterRegistry.register(AirQuality.Complete);
