/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { BooleanStateConfiguration } from "@matter/types/clusters/boolean-state-configuration";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { Identity } from "@matter/general";

/**
 * BooleanStateConfigurationBehavior is the base class for objects that support interaction with
 * {@link BooleanStateConfiguration.Cluster}.
 *
 * This class does not have optional features of BooleanStateConfiguration.Cluster enabled. You can enable additional
 * features using BooleanStateConfigurationBehavior.with.
 */
export const BooleanStateConfigurationBehaviorConstructor = ClusterBehavior.for(BooleanStateConfiguration);

export interface BooleanStateConfigurationBehaviorConstructor extends Identity<typeof BooleanStateConfigurationBehaviorConstructor> {}
export const BooleanStateConfigurationBehavior: BooleanStateConfigurationBehaviorConstructor = BooleanStateConfigurationBehaviorConstructor;
export interface BooleanStateConfigurationBehavior extends InstanceType<BooleanStateConfigurationBehaviorConstructor> {}
export namespace BooleanStateConfigurationBehavior {
    export interface State extends InstanceType<typeof BooleanStateConfigurationBehavior.State> {}
}
