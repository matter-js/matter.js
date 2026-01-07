/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { EnergyEvse } from "#clusters/energy-evse";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { EnergyEvseInterface } from "./EnergyEvseInterface.js";
import { Identity } from "#general";

/**
 * EnergyEvseBehavior is the base class for objects that support interaction with {@link EnergyEvse.Cluster}.
 *
 * This class does not have optional features of EnergyEvse.Cluster enabled. You can enable additional features using
 * EnergyEvseBehavior.with.
 */
export const EnergyEvseBehaviorConstructor = ClusterBehavior
    .withInterface<EnergyEvseInterface>()
    .for(EnergyEvse.Cluster);

export interface EnergyEvseBehaviorConstructor extends Identity<typeof EnergyEvseBehaviorConstructor> {}
export const EnergyEvseBehavior: EnergyEvseBehaviorConstructor = EnergyEvseBehaviorConstructor;
export interface EnergyEvseBehavior extends InstanceType<EnergyEvseBehaviorConstructor> {}
export namespace EnergyEvseBehavior { export interface State extends InstanceType<typeof EnergyEvseBehavior.State> {} }
