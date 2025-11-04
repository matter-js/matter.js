/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OperationalState } from "#clusters/operational-state";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const OperationalStateClientConstructor = ClientBehavior(OperationalState.Complete);
export interface OperationalStateClient extends InstanceType<typeof OperationalStateClientConstructor> {}
export interface OperationalStateClientConstructor extends Identity<typeof OperationalStateClientConstructor> {}
export const OperationalStateClient: OperationalStateClientConstructor = OperationalStateClientConstructor;
