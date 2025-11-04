/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Switch } from "#clusters/switch";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const SwitchClientConstructor = ClientBehavior(Switch.Complete);
export interface SwitchClient extends InstanceType<typeof SwitchClientConstructor> {}
export interface SwitchClientConstructor extends Identity<typeof SwitchClientConstructor> {}
export const SwitchClient: SwitchClientConstructor = SwitchClientConstructor;
