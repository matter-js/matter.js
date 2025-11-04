/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { LocalizationConfiguration } from "#clusters/localization-configuration";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const LocalizationConfigurationClientConstructor = ClientBehavior(LocalizationConfiguration.Complete);
export interface LocalizationConfigurationClient extends InstanceType<typeof LocalizationConfigurationClientConstructor> {}
export interface LocalizationConfigurationClientConstructor extends Identity<typeof LocalizationConfigurationClientConstructor> {}
export const LocalizationConfigurationClient: LocalizationConfigurationClientConstructor = LocalizationConfigurationClientConstructor;
