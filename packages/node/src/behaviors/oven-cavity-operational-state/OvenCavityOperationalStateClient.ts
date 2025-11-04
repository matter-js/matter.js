/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OvenCavityOperationalState } from "#clusters/oven-cavity-operational-state";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const OvenCavityOperationalStateClientConstructor = ClientBehavior(OvenCavityOperationalState.Complete);
export interface OvenCavityOperationalStateClient extends InstanceType<typeof OvenCavityOperationalStateClientConstructor> {}
export interface OvenCavityOperationalStateClientConstructor extends Identity<typeof OvenCavityOperationalStateClientConstructor> {}
export const OvenCavityOperationalStateClient: OvenCavityOperationalStateClientConstructor = OvenCavityOperationalStateClientConstructor;
