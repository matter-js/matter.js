/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { AdministratorCommissioning } from "#clusters/administrator-commissioning";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const AdministratorCommissioningClientConstructor = ClientBehavior(AdministratorCommissioning.Complete);
export interface AdministratorCommissioningClient extends InstanceType<typeof AdministratorCommissioningClientConstructor> {}
export interface AdministratorCommissioningClientConstructor extends Identity<typeof AdministratorCommissioningClientConstructor> {}
export const AdministratorCommissioningClient: AdministratorCommissioningClientConstructor = AdministratorCommissioningClientConstructor;
