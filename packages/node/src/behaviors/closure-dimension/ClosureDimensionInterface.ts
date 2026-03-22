/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "@matter/general";
import { ClosureDimension } from "@matter/types/clusters/closure-dimension";

export namespace ClosureDimensionInterface {
    export interface Base {
        /**
         * This command is used to move a dimension of the closure to a target position.
         *
         * The rationale behind defining the conformance as being purely optional in the table above is to ensure that
         * commands containing one or more fields related to unsupported features are still accepted, rather than being
         * rejected outright. For example, if a simple client, which is not able to determine the capabilities of the
         * server, invokes a command that includes both position and speed, a server that does not support the speed
         * feature would simply ignore the speed field while still adjusting its position as requested.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.5.8.1
         */
        setTarget(request: ClosureDimension.SetTargetRequest): MaybePromise;
    }

    export interface Positioning {
        /**
         * This command is used to move a dimension of the closure to a target position by a number of steps.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 5.5.8.2
         */
        step(request: ClosureDimension.StepRequest): MaybePromise;
    }
}

export type ClosureDimensionInterface = {
    components: [
        { flags: {}, methods: ClosureDimensionInterface.Base },
        { flags: { positioning: true }, methods: ClosureDimensionInterface.Positioning }
    ]
};
