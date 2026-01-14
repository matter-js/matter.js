/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TemperatureControl } from "#clusters/temperature-control";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { TemperatureControlInterface } from "./TemperatureControlInterface.js";
import { ClusterType } from "#types";
import { Identity } from "#general";

/**
 * TemperatureControlBehavior is the base class for objects that support interaction with
 * {@link TemperatureControl.Cluster}.
 *
 * TemperatureControl.Cluster requires you to enable one or more optional features. You can do so using
 * {@link TemperatureControlBehavior.with}.
 */
export const TemperatureControlBehaviorConstructor = ClusterBehavior
    .withInterface<TemperatureControlInterface>()
    .for(ClusterType(TemperatureControl.Base));

export interface TemperatureControlBehaviorConstructor extends Identity<typeof TemperatureControlBehaviorConstructor> {}
export const TemperatureControlBehavior: TemperatureControlBehaviorConstructor = TemperatureControlBehaviorConstructor;
export interface TemperatureControlBehavior extends InstanceType<TemperatureControlBehaviorConstructor> {}
export namespace TemperatureControlBehavior {
    export interface State extends InstanceType<typeof TemperatureControlBehavior.State> {}
}
