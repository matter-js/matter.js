/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { MicrowaveOvenMode } from "@matter/types/clusters/microwave-oven-mode";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const MicrowaveOvenModeClientConstructor = ClientBehavior(MicrowaveOvenMode.Complete);
export interface MicrowaveOvenModeClient extends InstanceType<typeof MicrowaveOvenModeClientConstructor> {}
export interface MicrowaveOvenModeClientConstructor extends Identity<typeof MicrowaveOvenModeClientConstructor> {}
export const MicrowaveOvenModeClient: MicrowaveOvenModeClientConstructor = MicrowaveOvenModeClientConstructor;
