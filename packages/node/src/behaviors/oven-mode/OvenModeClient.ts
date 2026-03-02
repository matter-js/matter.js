/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OvenMode } from "@matter/types/clusters/oven-mode";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const OvenModeClientConstructor = ClientBehavior(OvenMode.Complete);
export interface OvenModeClient extends InstanceType<typeof OvenModeClientConstructor> {}
export interface OvenModeClientConstructor extends Identity<typeof OvenModeClientConstructor> {}
export const OvenModeClient: OvenModeClientConstructor = OvenModeClientConstructor;
