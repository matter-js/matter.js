/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

/**
 * @see {@link MatterSpecification.v142.Cluster} § 9.1.4
 */
export enum PowerThresholdSource {
    /**
     * The power threshold comes from a signed contract
     */
    Contract = 0,

    /**
     * The power threshold comes from a legal regulator
     */
    Regulator = 1,

    /**
     * The power threshold comes from a certified limits of the meter
     */
    Equipment = 2
}
