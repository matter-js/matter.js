/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ValveConfigurationAndControl } from "@matter/types/clusters/valve-configuration-and-control";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * ValveConfigurationAndControlBehavior is the base class for objects that support interaction with
 * {@link ValveConfigurationAndControl.Cluster}.
 *
 * This class does not have optional features of ValveConfigurationAndControl.Cluster enabled. You can enable additional
 * features using ValveConfigurationAndControlBehavior.with.
 */
export const ValveConfigurationAndControlBehaviorConstructor = ClusterBehavior.for(ValveConfigurationAndControl);

export interface ValveConfigurationAndControlBehaviorConstructor extends Identity<typeof ValveConfigurationAndControlBehaviorConstructor> {}
export const ValveConfigurationAndControlBehavior: ValveConfigurationAndControlBehaviorConstructor = ValveConfigurationAndControlBehaviorConstructor;
export interface ValveConfigurationAndControlBehavior extends InstanceType<ValveConfigurationAndControlBehaviorConstructor> {}
export namespace ValveConfigurationAndControlBehavior {
    export interface State extends InstanceType<typeof ValveConfigurationAndControlBehavior.State> {}
}
