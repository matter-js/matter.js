/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { EnergyEvseMode } from "#clusters/energy-evse-mode";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { EnergyEvseModeInterface } from "./EnergyEvseModeInterface.js";
import { Identity } from "#general";

/**
 * EnergyEvseModeBehavior is the base class for objects that support interaction with {@link EnergyEvseMode.Cluster}.
 */
export const EnergyEvseModeBehaviorConstructor = ClusterBehavior
    .withInterface<EnergyEvseModeInterface>()
    .for(EnergyEvseMode.Cluster);

export interface EnergyEvseModeBehaviorConstructor extends Identity<typeof EnergyEvseModeBehaviorConstructor> {}
export const EnergyEvseModeBehavior: EnergyEvseModeBehaviorConstructor = EnergyEvseModeBehaviorConstructor;
export interface EnergyEvseModeBehavior extends InstanceType<EnergyEvseModeBehaviorConstructor> {}
export namespace EnergyEvseModeBehavior {
    export interface State extends InstanceType<typeof EnergyEvseModeBehavior.State> {}
}
