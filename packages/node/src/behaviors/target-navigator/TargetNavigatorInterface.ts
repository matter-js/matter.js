/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MaybePromise } from "#general";
import { TargetNavigator } from "#clusters/target-navigator";

export namespace TargetNavigatorInterface {
    export interface Base {
        /**
         * Upon receipt, this shall navigation the UX to the target identified.
         *
         * @see {@link MatterSpecification.v142.Cluster} § 6.11.6.1
         */
        navigateTarget(request: TargetNavigator.NavigateTargetRequest): MaybePromise<TargetNavigator.NavigateTargetResponse>;
    }
}

export type TargetNavigatorInterface = { components: [{ flags: {}, methods: TargetNavigatorInterface.Base }] };
