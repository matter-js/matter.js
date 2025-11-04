/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { TargetNavigator } from "#clusters/target-navigator";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const TargetNavigatorClientConstructor = ClientBehavior(TargetNavigator.Complete);
export interface TargetNavigatorClient extends InstanceType<typeof TargetNavigatorClientConstructor> {}
export interface TargetNavigatorClientConstructor extends Identity<typeof TargetNavigatorClientConstructor> {}
export const TargetNavigatorClient: TargetNavigatorClientConstructor = TargetNavigatorClientConstructor;
