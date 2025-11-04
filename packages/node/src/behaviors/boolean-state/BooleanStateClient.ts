/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { BooleanState } from "#clusters/boolean-state";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const BooleanStateClientConstructor = ClientBehavior(BooleanState.Complete);
export interface BooleanStateClient extends InstanceType<typeof BooleanStateClientConstructor> {}
export interface BooleanStateClientConstructor extends Identity<typeof BooleanStateClientConstructor> {}
export const BooleanStateClient: BooleanStateClientConstructor = BooleanStateClientConstructor;
