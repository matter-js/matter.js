/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { RvcCleanMode } from "#clusters/rvc-clean-mode";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const RvcCleanModeClientConstructor = ClientBehavior(RvcCleanMode.Complete);
export interface RvcCleanModeClient extends InstanceType<typeof RvcCleanModeClientConstructor> {}
export interface RvcCleanModeClientConstructor extends Identity<typeof RvcCleanModeClientConstructor> {}
export const RvcCleanModeClient: RvcCleanModeClientConstructor = RvcCleanModeClientConstructor;
