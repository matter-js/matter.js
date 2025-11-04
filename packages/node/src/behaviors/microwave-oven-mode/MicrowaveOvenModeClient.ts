/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MicrowaveOvenMode } from "#clusters/microwave-oven-mode";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const MicrowaveOvenModeClientConstructor = ClientBehavior(MicrowaveOvenMode.Complete);
export interface MicrowaveOvenModeClient extends InstanceType<typeof MicrowaveOvenModeClientConstructor> {}
export interface MicrowaveOvenModeClientConstructor extends Identity<typeof MicrowaveOvenModeClientConstructor> {}
export const MicrowaveOvenModeClient: MicrowaveOvenModeClientConstructor = MicrowaveOvenModeClientConstructor;
