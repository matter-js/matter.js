/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ThermostatUserInterfaceConfiguration } from "@matter/types/clusters/thermostat-user-interface-configuration";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const ThermostatUserInterfaceConfigurationClientConstructor = ClientBehavior(ThermostatUserInterfaceConfiguration);
export interface ThermostatUserInterfaceConfigurationClient extends InstanceType<typeof ThermostatUserInterfaceConfigurationClientConstructor> {}
export interface ThermostatUserInterfaceConfigurationClientConstructor extends Identity<typeof ThermostatUserInterfaceConfigurationClientConstructor> {}
export const ThermostatUserInterfaceConfigurationClient: ThermostatUserInterfaceConfigurationClientConstructor = ThermostatUserInterfaceConfigurationClientConstructor;
