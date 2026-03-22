/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MutableCluster } from "../cluster/mutation/MutableCluster.js";
import { Attribute } from "../cluster/Cluster.js";
import { TlvArray } from "../tlv/TlvArray.js";
import { TlvField, TlvObject } from "../tlv/TlvObject.js";
import { TlvUInt32, TlvInt64, TlvEpochS, TlvEnum, TlvUInt16 } from "../tlv/TlvNumber.js";
import { TypeFromSchema } from "../tlv/TlvSchema.js";
import { TlvNullable } from "../tlv/TlvNullable.js";
import { TariffUnit } from "../globals/TariffUnit.js";
import { Identity } from "@matter/general";
import { ClusterRegistry } from "../cluster/ClusterRegistry.js";

export namespace CommodityMetering {
    /**
     * Provides access to the Electric Metering device’s readings.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.11.4.1
     */
    export const TlvMeteredQuantity = TlvObject({
        /**
         * Indicates the specific TariffComponentStructs associated with the metered commodity.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.11.4.1.1
         */
        tariffComponentIDs: TlvField(0, TlvArray(TlvUInt32, { maxLength: 128 })),

        /**
         * This field indicates the amount of a commodity metered during the associated TariffComponentStructs.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.11.4.1.2
         */
        quantity: TlvField(1, TlvInt64)
    });

    /**
     * Provides access to the Electric Metering device’s readings.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.11.4.1
     */
    export interface MeteredQuantity extends TypeFromSchema<typeof TlvMeteredQuantity> {}

    /**
     * @see {@link Cluster}
     */
    export const ClusterInstance = MutableCluster({
        id: 0xb07,
        name: "CommodityMetering",
        revision: 1,

        attributes: {
            /**
             * The most recent summed value of a commodity delivered to and consumed in the premises. A null value
             * indicates that metering data is currently unavailable.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.11.5.1
             */
            meteredQuantity: Attribute(0x0, TlvNullable(TlvArray(TlvMeteredQuantity))),

            /**
             * The timestamp in UTC for when the value of the MeteredQuantity attribute was last updated. A null value
             * indicates that metering data is currently unavailable.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.11.5.2
             */
            meteredQuantityTimestamp: Attribute(0x1, TlvNullable(TlvEpochS)),

            /**
             * Indicates the unit for the Quantity field on all MeteredQuantityStructs in the MeteredQuantity attribute.
             * A null value indicates that metering data is currently unavailable.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.11.5.3
             */
            tariffUnit: Attribute(0x2, TlvNullable(TlvEnum<TariffUnit>())),

            /**
             * Indicates the maximum number of MeteredQuantityStructs in the MeteredQuantity attribute. A null value
             * indicates that metering data is currently unavailable.
             *
             * @see {@link MatterSpecification.v142.Cluster} § 9.11.5.4
             */
            maximumMeteredQuantities: Attribute(0x3, TlvNullable(TlvUInt16.bound({ min: 1 })))
        }
    });

    /**
     * The Commodity Metering Cluster provides the mechanism for communicating commodity consumption information within
     * a premises.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 9.11
     */
    export interface Cluster extends Identity<typeof ClusterInstance> {}

    export const Cluster: Cluster = ClusterInstance;
    export const Complete = Cluster;
}

export type CommodityMeteringCluster = CommodityMetering.Cluster;
export const CommodityMeteringCluster = CommodityMetering.Cluster;
ClusterRegistry.register(CommodityMetering.Complete);
