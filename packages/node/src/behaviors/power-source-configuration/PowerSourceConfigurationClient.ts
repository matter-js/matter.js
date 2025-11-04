/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { PowerSourceConfiguration } from "#clusters/power-source-configuration";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const PowerSourceConfigurationClientConstructor = ClientBehavior(PowerSourceConfiguration.Complete);
export interface PowerSourceConfigurationClient extends InstanceType<typeof PowerSourceConfigurationClientConstructor> {}
export interface PowerSourceConfigurationClientConstructor extends Identity<typeof PowerSourceConfigurationClientConstructor> {}
export const PowerSourceConfigurationClient: PowerSourceConfigurationClientConstructor = PowerSourceConfigurationClientConstructor;
