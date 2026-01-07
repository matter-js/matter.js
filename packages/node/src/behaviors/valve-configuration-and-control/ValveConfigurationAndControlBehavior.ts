/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ValveConfigurationAndControl } from "#clusters/valve-configuration-and-control";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { ValveConfigurationAndControlInterface } from "./ValveConfigurationAndControlInterface.js";
import { Identity } from "#general";

/**
 * ValveConfigurationAndControlBehavior is the base class for objects that support interaction with
 * {@link ValveConfigurationAndControl.Cluster}.
 *
 * This class does not have optional features of ValveConfigurationAndControl.Cluster enabled. You can enable additional
 * features using ValveConfigurationAndControlBehavior.with.
 */
export const ValveConfigurationAndControlBehaviorConstructor = ClusterBehavior
    .withInterface<ValveConfigurationAndControlInterface>()
    .for(ValveConfigurationAndControl.Cluster);

export interface ValveConfigurationAndControlBehaviorConstructor extends Identity<typeof ValveConfigurationAndControlBehaviorConstructor> {}
export const ValveConfigurationAndControlBehavior: ValveConfigurationAndControlBehaviorConstructor = ValveConfigurationAndControlBehaviorConstructor;
export interface ValveConfigurationAndControlBehavior extends InstanceType<ValveConfigurationAndControlBehaviorConstructor> {}
export namespace ValveConfigurationAndControlBehavior {
    export interface State extends InstanceType<typeof ValveConfigurationAndControlBehavior.State> {}
}
