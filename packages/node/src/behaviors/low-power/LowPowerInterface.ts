/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";

export namespace LowPowerInterface {
    export interface Base {
        /**
         * This command shall put the device into low power mode.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 1.11.4.1
         */
        sleep(): MaybePromise;
    }
}

export type LowPowerInterface = { components: [{ flags: {}, methods: LowPowerInterface.Base }] };
