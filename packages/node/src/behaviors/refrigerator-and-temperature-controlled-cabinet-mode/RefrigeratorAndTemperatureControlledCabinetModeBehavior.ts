/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import {
    RefrigeratorAndTemperatureControlledCabinetMode
} from "@matter/types/clusters/refrigerator-and-temperature-controlled-cabinet-mode";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * RefrigeratorAndTemperatureControlledCabinetModeBehavior is the base class for objects that support interaction with
 * {@link RefrigeratorAndTemperatureControlledCabinetMode.Cluster}.
 */
export const RefrigeratorAndTemperatureControlledCabinetModeBehaviorConstructor = ClusterBehavior
    .for(RefrigeratorAndTemperatureControlledCabinetMode);

export interface RefrigeratorAndTemperatureControlledCabinetModeBehaviorConstructor extends Identity<typeof RefrigeratorAndTemperatureControlledCabinetModeBehaviorConstructor> {}
export const RefrigeratorAndTemperatureControlledCabinetModeBehavior: RefrigeratorAndTemperatureControlledCabinetModeBehaviorConstructor = RefrigeratorAndTemperatureControlledCabinetModeBehaviorConstructor;
export interface RefrigeratorAndTemperatureControlledCabinetModeBehavior extends InstanceType<RefrigeratorAndTemperatureControlledCabinetModeBehaviorConstructor> {}
export namespace RefrigeratorAndTemperatureControlledCabinetModeBehavior {
    export interface State extends InstanceType<typeof RefrigeratorAndTemperatureControlledCabinetModeBehavior.State> {}
}
