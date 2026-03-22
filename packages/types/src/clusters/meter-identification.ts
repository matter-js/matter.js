/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute, OptionalAttribute } from "../cluster/Cluster.js";
import { TlvPowerThreshold } from "../globals/PowerThreshold.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { BitFlag } from "../schema/BitmapSchema.js";
import { TlvEnum } from "../tlv/TlvNumber.js";
import { TlvString } from "../tlv/TlvString.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace MeterIdentification {
    /**
     * These are optional features supported by MeterIdentificationCluster.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.10.4
     */
    export enum Feature {
        /**
         * PowerThreshold (PWRTHLD)
         *
         * Supports information about power threshold
         */
        PowerThreshold = "PowerThreshold"
    }

    /**
     * @see {@link MatterSpecification.v142.Cluster} § 9.10.5.1
     */
    export enum MeterType {
        /**
         * Utility Meter
         */
        Utility = 0,

        /**
         * Private Meter
         */
        Private = 1,

        /**
         * Generic Meter
         */
        Generic = 2
    }

    /**
     * A MeterIdentificationCluster supports these elements if it supports feature PowerThreshold.
     */
    export const PowerThresholdComponent = MutableCluster.Component({
        attributes: {
            /**
             * @see {@link MatterSpecification.v142.Cluster} § 9.10.6
             */
            powerThreshold: Attribute(0x4, TlvNullable(TlvPowerThreshold))
        }
    });

    /**
     * These elements and properties are present in all MeterIdentification clusters.
     */
    export const Base = MutableCluster.Component({
        id: 0xb06,
        name: "MeterIdentification",
        revision: 1,

        features: {
            /**
             * Supports information about power threshold
             */
            powerThreshold: BitFlag(0)
        },

        attributes: {
            /**
             * Indicates the Meter type features, decided by manufacturer. If the type is unavailable, this attribute
             * shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.10.6.1
             */
            meterType: Attribute(0x0, TlvNullable(TlvEnum<MeterType>())),

            /**
             * Indicates the unique identification of the connection point for the premises for billing purposes. If the
             * point of delivery is unavailable, this attribute shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.10.6.2
             */
            pointOfDelivery: Attribute(0x1, TlvNullable(TlvString.bound({ maxLength: 64 }))),

            /**
             * Indicates the serial number of the meter. If the serial number is unavailable, this attribute shall be
             * null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.10.6.3
             */
            meterSerialNumber: Attribute(0x2, TlvNullable(TlvString.bound({ maxLength: 64 }))),

            /**
             * Indicates the underlying protocol version to express local market features. If the protocol version is
             * unavailable, this attribute shall be null.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.10.6.4
             */
            protocolVersion: OptionalAttribute(0x3, TlvNullable(TlvString.bound({ maxLength: 64 })))
        },

        /**
         * This metadata controls which MeterIdentificationCluster elements matter.js activates for specific feature
         * combinations.
         */
        extensions: MutableCluster.Extensions({ flags: { powerThreshold: true }, component: PowerThresholdComponent })
    });

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster(Base);

    /**
     * This Meter Identification Cluster provides attributes for determining advanced information about utility metering
     * device.
     *
     * MeterIdentificationCluster supports optional features that you can enable with the
     * MeterIdentificationCluster.with() factory method.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.10
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    const PWRTHLD = { powerThreshold: true };

    /**
     * @see {@link Complete}
     */
    export const CompleteInstance = MutableCluster({
        id: Cluster.id,
        name: Cluster.name,
        revision: Cluster.revision,
        features: Cluster.features,

        attributes: {
            ...Cluster.attributes,
            powerThreshold: MutableCluster.AsConditional(
                PowerThresholdComponent.attributes.powerThreshold,
                { mandatoryIf: [PWRTHLD] }
            )
        }
    });

    /**
     * This cluster supports all MeterIdentification features. It may support illegal feature combinations.
     *
     * If you use this cluster you must manually specify which features are active and ensure the set of active features
     * is legal per the Matter specification.
     */
    export interface Complete extends Identity<typeof CompleteInstance> {}

    export const Complete: Complete = CompleteInstance;
}

export type MeterIdentificationCluster = MeterIdentification.Cluster;
export const MeterIdentificationCluster = MeterIdentification.Cluster;
ClusterRegistry.register(MeterIdentification.Complete);
