/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { BitFlag } from "../schema/BitmapSchema.js";

/**
 * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.1
 */
export const Occupancy = {
    /**
     * Indicates the sensed occupancy state
     *
     * If this bit is set, it shall indicate the occupied state else if the bit if not set, it shall indicate the
     * unoccupied state.
     *
     * @see {@link MatterSpecification.v142.Cluster} § 2.7.5.1.1
     */
    occupied: BitFlag(0)
};
