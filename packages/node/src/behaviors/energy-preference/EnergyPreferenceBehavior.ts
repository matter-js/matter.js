/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { EnergyPreference } from "#clusters/energy-preference";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * EnergyPreferenceBehavior is the base class for objects that support interaction with
 * {@link EnergyPreference.Cluster}.
 *
 * EnergyPreference.Cluster requires you to enable one or more optional features. You can do so using
 * {@link EnergyPreferenceBehavior.with}.
 */
export const EnergyPreferenceBehaviorConstructor = ClusterBehavior.for(ClusterType(EnergyPreference.Base));

export interface EnergyPreferenceBehaviorConstructor extends Identity<typeof EnergyPreferenceBehaviorConstructor> {}
export const EnergyPreferenceBehavior: EnergyPreferenceBehaviorConstructor = EnergyPreferenceBehaviorConstructor;
export interface EnergyPreferenceBehavior extends InstanceType<EnergyPreferenceBehaviorConstructor> {}
export namespace EnergyPreferenceBehavior {
    export interface State extends InstanceType<typeof EnergyPreferenceBehavior.State> {}
}
