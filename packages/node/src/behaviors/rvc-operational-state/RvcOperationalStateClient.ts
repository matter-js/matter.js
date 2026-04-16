/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { RvcOperationalState } from "@matter/types/clusters/rvc-operational-state";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const RvcOperationalStateClientConstructor = ClientBehavior(RvcOperationalState);
export interface RvcOperationalStateClient extends InstanceType<typeof RvcOperationalStateClientConstructor> {}
export interface RvcOperationalStateClientConstructor extends Identity<typeof RvcOperationalStateClientConstructor> {}
export const RvcOperationalStateClient: RvcOperationalStateClientConstructor = RvcOperationalStateClientConstructor;
