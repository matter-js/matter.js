/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ThermostatUserInterfaceConfiguration } from "#clusters/thermostat-user-interface-configuration";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ThermostatUserInterfaceConfigurationClientConstructor = ClientBehavior(
    ThermostatUserInterfaceConfiguration.Complete
);
export interface ThermostatUserInterfaceConfigurationClient extends InstanceType<typeof ThermostatUserInterfaceConfigurationClientConstructor> {}
export interface ThermostatUserInterfaceConfigurationClientConstructor extends Identity<typeof ThermostatUserInterfaceConfigurationClientConstructor> {}
export const ThermostatUserInterfaceConfigurationClient: ThermostatUserInterfaceConfigurationClientConstructor = ThermostatUserInterfaceConfigurationClientConstructor;
