/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ModeSelect } from "#clusters/mode-select";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ModeSelectClientConstructor = ClientBehavior(ModeSelect.Complete);
export interface ModeSelectClient extends InstanceType<typeof ModeSelectClientConstructor> {}
export interface ModeSelectClientConstructor extends Identity<typeof ModeSelectClientConstructor> {}
export const ModeSelectClient: ModeSelectClientConstructor = ModeSelectClientConstructor;
