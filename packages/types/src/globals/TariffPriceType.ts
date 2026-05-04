/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

/**
 * @see {@link MatterSpecification.v151.Cluster} § 9.1.5
 */
export enum TariffPriceType {
    /**
     * Standard tariff price
     *
     * This value shall indicate that a price comes from a standard tariff rate.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.1.5.1
     */
    Standard = 0,

    /**
     * Price during CPP events
     *
     * This value shall indicate that a price comes from a critical peak pricing event.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.1.5.2
     */
    Critical = 1,

    /**
     * Price during VPP events
     *
     * This value shall indicate that a price comes from a virtual power plant event.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.1.5.3
     */
    Virtual = 2,

    /**
     * Price incentives
     *
     * This value shall indicate that a price comes from a incentive event.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.1.5.4
     */
    Incentive = 3,

    /**
     * Price incentive signals
     *
     * This value shall indicate that a price is synthesized from a non-tariff source; e.g. gCO2e/kWh.
     *
     * @see {@link MatterSpecification.v151.Cluster} § 9.1.5.5
     */
    IncentiveSignal = 4
}
