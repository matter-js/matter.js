/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { LocalizationConfiguration } from "#clusters/localization-configuration";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "#general";

/**
 * LocalizationConfigurationBehavior is the base class for objects that support interaction with
 * {@link LocalizationConfiguration.Cluster}.
 */
export const LocalizationConfigurationBehaviorConstructor = ClusterBehavior.for(LocalizationConfiguration.Cluster);

export interface LocalizationConfigurationBehaviorConstructor extends Identity<typeof LocalizationConfigurationBehaviorConstructor> {}
export const LocalizationConfigurationBehavior: LocalizationConfigurationBehaviorConstructor = LocalizationConfigurationBehaviorConstructor;
export interface LocalizationConfigurationBehavior extends InstanceType<LocalizationConfigurationBehaviorConstructor> {}
export namespace LocalizationConfigurationBehavior {
    export interface State extends InstanceType<typeof LocalizationConfigurationBehavior.State> {}
}
