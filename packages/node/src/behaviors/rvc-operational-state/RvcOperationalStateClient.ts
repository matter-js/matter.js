/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { RvcOperationalState } from "#clusters/rvc-operational-state";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const RvcOperationalStateClientConstructor = ClientBehavior(RvcOperationalState.Complete);
export interface RvcOperationalStateClient extends InstanceType<typeof RvcOperationalStateClientConstructor> {}
export interface RvcOperationalStateClientConstructor extends Identity<typeof RvcOperationalStateClientConstructor> {}
export const RvcOperationalStateClient: RvcOperationalStateClientConstructor = RvcOperationalStateClientConstructor;
