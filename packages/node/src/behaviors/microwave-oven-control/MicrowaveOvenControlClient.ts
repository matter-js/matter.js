/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MicrowaveOvenControl } from "#clusters/microwave-oven-control";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const MicrowaveOvenControlClientConstructor = ClientBehavior(MicrowaveOvenControl.Complete);
export interface MicrowaveOvenControlClient extends InstanceType<typeof MicrowaveOvenControlClientConstructor> {}
export interface MicrowaveOvenControlClientConstructor extends Identity<typeof MicrowaveOvenControlClientConstructor> {}
export const MicrowaveOvenControlClient: MicrowaveOvenControlClientConstructor = MicrowaveOvenControlClientConstructor;
