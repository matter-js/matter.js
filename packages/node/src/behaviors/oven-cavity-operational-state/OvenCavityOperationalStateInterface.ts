/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { OvenCavityOperationalState } from "@matter/types/clusters/oven-cavity-operational-state";

export namespace OvenCavityOperationalStateInterface {
    export interface Base {
        /**
         * @see {@link MatterSpecification.v142.Cluster} § 8.10.5
         */
        stop(): MaybePromise<OvenCavityOperationalState.OperationalCommandResponse>;

        /**
         * @see {@link MatterSpecification.v142.Cluster} § 8.10.5
         */
        start(): MaybePromise<OvenCavityOperationalState.OperationalCommandResponse>;
    }
}

export type OvenCavityOperationalStateInterface = {
    components: [{ flags: {}, methods: OvenCavityOperationalStateInterface.Base }]
};
