/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PowerSourceConfiguration } from "#clusters/power-source-configuration";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * PowerSourceConfigurationBehavior is the base class for objects that support interaction with
 * {@link PowerSourceConfiguration.Cluster}.
 */
export const PowerSourceConfigurationBehaviorConstructor = ClusterBehavior.for(PowerSourceConfiguration.Cluster);

export interface PowerSourceConfigurationBehaviorConstructor extends Identity<typeof PowerSourceConfigurationBehaviorConstructor> {}
export const PowerSourceConfigurationBehavior: PowerSourceConfigurationBehaviorConstructor = PowerSourceConfigurationBehaviorConstructor;
export interface PowerSourceConfigurationBehavior extends InstanceType<PowerSourceConfigurationBehaviorConstructor> {}
export namespace PowerSourceConfigurationBehavior {
    export interface State extends InstanceType<typeof PowerSourceConfigurationBehavior.State> {}
}
