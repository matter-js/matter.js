/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ThermostatUserInterfaceConfiguration } from "#clusters/thermostat-user-interface-configuration";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * ThermostatUserInterfaceConfigurationBehavior is the base class for objects that support interaction with
 * {@link ThermostatUserInterfaceConfiguration.Cluster}.
 */
export const ThermostatUserInterfaceConfigurationBehaviorConstructor = ClusterBehavior
    .for(ThermostatUserInterfaceConfiguration.Cluster);

export interface ThermostatUserInterfaceConfigurationBehaviorConstructor extends Identity<typeof ThermostatUserInterfaceConfigurationBehaviorConstructor> {}
export const ThermostatUserInterfaceConfigurationBehavior: ThermostatUserInterfaceConfigurationBehaviorConstructor = ThermostatUserInterfaceConfigurationBehaviorConstructor;
export interface ThermostatUserInterfaceConfigurationBehavior extends InstanceType<ThermostatUserInterfaceConfigurationBehaviorConstructor> {}
export namespace ThermostatUserInterfaceConfigurationBehavior {
    export interface State extends InstanceType<typeof ThermostatUserInterfaceConfigurationBehavior.State> {}
}
