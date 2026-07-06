/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { AmbientContextSensing } from "@matter/types/clusters/ambient-context-sensing";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * AmbientContextSensingBehavior is the base class for objects that support interaction with
 * {@link AmbientContextSensing.Cluster}.
 *
 * AmbientContextSensing.Cluster requires you to enable one or more optional features. You can do so using
 * {@link AmbientContextSensingBehavior.with}.
 */
export const AmbientContextSensingBehaviorConstructor = ClusterBehavior.for(AmbientContextSensing);

export interface AmbientContextSensingBehaviorConstructor extends Identity<typeof AmbientContextSensingBehaviorConstructor> {}
export const AmbientContextSensingBehavior: AmbientContextSensingBehaviorConstructor = AmbientContextSensingBehaviorConstructor;
export interface AmbientContextSensingBehavior extends InstanceType<AmbientContextSensingBehaviorConstructor> {}
export namespace AmbientContextSensingBehavior {
    export interface State extends InstanceType<typeof AmbientContextSensingBehavior.State> {}
}
