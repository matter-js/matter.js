/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MicrowaveOvenMode } from "#clusters/microwave-oven-mode";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { MicrowaveOvenModeInterface } from "./MicrowaveOvenModeInterface.js";
import { Identity } from "#general";

/**
 * MicrowaveOvenModeBehavior is the base class for objects that support interaction with
 * {@link MicrowaveOvenMode.Cluster}.
 */
export const MicrowaveOvenModeBehaviorConstructor = ClusterBehavior
    .withInterface<MicrowaveOvenModeInterface>()
    .for(MicrowaveOvenMode.Cluster);

export interface MicrowaveOvenModeBehaviorConstructor extends Identity<typeof MicrowaveOvenModeBehaviorConstructor> {}
export const MicrowaveOvenModeBehavior: MicrowaveOvenModeBehaviorConstructor = MicrowaveOvenModeBehaviorConstructor;
export interface MicrowaveOvenModeBehavior extends InstanceType<MicrowaveOvenModeBehaviorConstructor> {}
export namespace MicrowaveOvenModeBehavior {
    export interface State extends InstanceType<typeof MicrowaveOvenModeBehavior.State> {}
}
