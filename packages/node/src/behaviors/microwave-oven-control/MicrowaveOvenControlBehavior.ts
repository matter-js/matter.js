/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MicrowaveOvenControl } from "#clusters/microwave-oven-control";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { MicrowaveOvenControlInterface } from "./MicrowaveOvenControlInterface.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * MicrowaveOvenControlBehavior is the base class for objects that support interaction with
 * {@link MicrowaveOvenControl.Cluster}.
 *
 * MicrowaveOvenControl.Cluster requires you to enable one or more optional features. You can do so using
 * {@link MicrowaveOvenControlBehavior.with}.
 */
export const MicrowaveOvenControlBehaviorConstructor = ClusterBehavior
    .withInterface<MicrowaveOvenControlInterface>()
    .for(ClusterType(MicrowaveOvenControl.Base));

export interface MicrowaveOvenControlBehaviorConstructor extends Identity<typeof MicrowaveOvenControlBehaviorConstructor> {}
export const MicrowaveOvenControlBehavior: MicrowaveOvenControlBehaviorConstructor = MicrowaveOvenControlBehaviorConstructor;
export interface MicrowaveOvenControlBehavior extends InstanceType<MicrowaveOvenControlBehaviorConstructor> {}
export namespace MicrowaveOvenControlBehavior {
    export interface State extends InstanceType<typeof MicrowaveOvenControlBehavior.State> {}
}
