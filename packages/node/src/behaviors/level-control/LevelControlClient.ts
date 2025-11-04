/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { LevelControl } from "#clusters/level-control";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const LevelControlClientConstructor = ClientBehavior(LevelControl.Complete);
export interface LevelControlClient extends InstanceType<typeof LevelControlClientConstructor> {}
export interface LevelControlClientConstructor extends Identity<typeof LevelControlClientConstructor> {}
export const LevelControlClient: LevelControlClientConstructor = LevelControlClientConstructor;
