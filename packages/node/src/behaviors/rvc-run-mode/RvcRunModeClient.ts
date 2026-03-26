/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { RvcRunMode } from "@matter/types/clusters/rvc-run-mode";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const RvcRunModeClientConstructor = ClientBehavior(RvcRunMode);
export interface RvcRunModeClient extends InstanceType<typeof RvcRunModeClientConstructor> {}
export interface RvcRunModeClientConstructor extends Identity<typeof RvcRunModeClientConstructor> {}
export const RvcRunModeClient: RvcRunModeClientConstructor = RvcRunModeClientConstructor;
