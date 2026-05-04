/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import type { ClusterType, ClusterTyping } from "../cluster/ClusterType.js";
import type { ClusterId } from "../datatype/ClusterId.js";
import type { ClusterModel } from "@matter/model";
import type { TariffUnit } from "../globals/TariffUnit.js";

/**
 * Definitions for the CommodityMetering cluster.
 *
 * The Commodity Metering Cluster provides the mechanism for communicating commodity consumption information within a
 * premises.
 *
 * @see {@link MatterSpecification.v151.Cluster} § 9.11
 */
export declare namespace CommodityMetering {
    /**
     * The Matter protocol cluster identifier.
     */
    export const id: ClusterId & 0x0b07;

    /**
     * Textual cluster identifier.
     */
    export const name: "CommodityMetering";

    /**
     * The cluster revision assigned by {@link MatterSpecification.v142.Cluster}.
     */
    export const revision: 1;

    /**
     * Canonical metadata for the CommodityMetering cluster.
     *
     * This is the exhaustive runtime metadata source that matter.js considers canonical.
     */
    export const schema: ClusterModel;

    /**
     * {@link CommodityMetering} always supports these elements.
     */
    export interface BaseAttributes {
        /**
         * The most recent summed value of a commodity delivered to and consumed in the premises. A null value indicates
         * that metering data is currently unavailable.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.11.5.1
         */
        meteredQuantity: MeteredQuantity[] | null;

        /**
         * The timestamp in UTC for when the value of the MeteredQuantity attribute was last updated. A null value
         * indicates that metering data is currently unavailable.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.11.5.2
         */
        meteredQuantityTimestamp: number | null;

        /**
         * Indicates the unit for the Quantity field on all MeteredQuantityStructs in the MeteredQuantity attribute. A
         * null value indicates that metering data is currently unavailable.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.11.5.3
         */
        tariffUnit: TariffUnit | null;

        /**
         * Indicates the maximum number of MeteredQuantityStructs in the MeteredQuantity attribute. A null value
         * indicates that metering data is currently unavailable.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.11.5.4
         */
        maximumMeteredQuantities: number | null;
    }

    /**
     * Attributes that may appear in {@link CommodityMetering}.
     */
    export interface Attributes {
        /**
         * The most recent summed value of a commodity delivered to and consumed in the premises. A null value indicates
         * that metering data is currently unavailable.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.11.5.1
         */
        meteredQuantity: MeteredQuantity[] | null;

        /**
         * The timestamp in UTC for when the value of the MeteredQuantity attribute was last updated. A null value
         * indicates that metering data is currently unavailable.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.11.5.2
         */
        meteredQuantityTimestamp: number | null;

        /**
         * Indicates the unit for the Quantity field on all MeteredQuantityStructs in the MeteredQuantity attribute. A
         * null value indicates that metering data is currently unavailable.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.11.5.3
         */
        tariffUnit: TariffUnit | null;

        /**
         * Indicates the maximum number of MeteredQuantityStructs in the MeteredQuantity attribute. A null value
         * indicates that metering data is currently unavailable.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.11.5.4
         */
        maximumMeteredQuantities: number | null;
    }

    export type Components = [{ flags: {}, attributes: BaseAttributes }];

    /**
     * Provides access to the Electric Metering device's readings.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.11.4.1
     */
    export declare class MeteredQuantity {
        constructor(values?: Partial<MeteredQuantity>);

        /**
         * Indicates the specific TariffComponentStructs associated with the metered commodity.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.11.4.1.1
         */
        tariffComponentIDs: number[];

        /**
         * This field indicates the amount of a commodity metered during the associated TariffComponentStructs.
         *
         * @see {@link MatterSpecification.v151.Cluster} § 9.11.4.1.2
         */
        quantity: number | bigint;
    };

    /**
     * Attribute metadata objects keyed by name.
     */
    export const attributes: ClusterType.AttributeObjects<Attributes>;

    /**
     * @deprecated Use {@link CommodityMetering}.
     */
    export const Cluster: typeof CommodityMetering;

    /**
     * @deprecated Use {@link CommodityMetering}.
     */
    export const Complete: typeof CommodityMetering;

    export const Typing: CommodityMetering;
}

/**
 * @deprecated Use {@link CommodityMetering}.
 */
export declare const CommodityMeteringCluster: typeof CommodityMetering;

export interface CommodityMetering extends ClusterTyping {
    Attributes: CommodityMetering.Attributes;
    Components: CommodityMetering.Components;
}
