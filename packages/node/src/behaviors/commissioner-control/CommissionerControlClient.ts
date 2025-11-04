/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { CommissionerControl } from "#clusters/commissioner-control";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const CommissionerControlClientConstructor = ClientBehavior(CommissionerControl.Complete);
export interface CommissionerControlClient extends InstanceType<typeof CommissionerControlClientConstructor> {}
export interface CommissionerControlClientConstructor extends Identity<typeof CommissionerControlClientConstructor> {}
export const CommissionerControlClient: CommissionerControlClientConstructor = CommissionerControlClientConstructor;
