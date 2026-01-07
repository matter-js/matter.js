/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PumpConfigurationAndControl } from "#clusters/pump-configuration-and-control";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * PumpConfigurationAndControlBehavior is the base class for objects that support interaction with
 * {@link PumpConfigurationAndControl.Cluster}.
 *
 * PumpConfigurationAndControl.Cluster requires you to enable one or more optional features. You can do so using
 * {@link PumpConfigurationAndControlBehavior.with}.
 */
export const PumpConfigurationAndControlBehaviorConstructor = ClusterBehavior
    .for(ClusterType(PumpConfigurationAndControl.Base));

export interface PumpConfigurationAndControlBehaviorConstructor extends Identity<typeof PumpConfigurationAndControlBehaviorConstructor> {}
export const PumpConfigurationAndControlBehavior: PumpConfigurationAndControlBehaviorConstructor = PumpConfigurationAndControlBehaviorConstructor;
export interface PumpConfigurationAndControlBehavior extends InstanceType<PumpConfigurationAndControlBehaviorConstructor> {}
export namespace PumpConfigurationAndControlBehavior {
    export interface State extends InstanceType<typeof PumpConfigurationAndControlBehavior.State> {}
}
