/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { WaterHeaterManagement } from "#clusters/water-heater-management";

export namespace WaterHeaterManagementInterface {
    export interface Base {
        /**
         * Allows a client to request that the water heater is put into a Boost state.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.5.8.1
         */
        boost(request: WaterHeaterManagement.BoostRequest): MaybePromise;

        /**
         * Allows a client to cancel an ongoing Boost operation. This command has no payload.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 9.5.8.2
         */
        cancelBoost(): MaybePromise;
    }
}

export type WaterHeaterManagementInterface = { components: [{ flags: {}, methods: WaterHeaterManagementInterface.Base }] };
