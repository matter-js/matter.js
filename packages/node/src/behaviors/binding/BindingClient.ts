/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Binding } from "#clusters/binding";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const BindingClientConstructor = ClientBehavior(Binding.Complete);
export interface BindingClient extends InstanceType<typeof BindingClientConstructor> {}
export interface BindingClientConstructor extends Identity<typeof BindingClientConstructor> {}
export const BindingClient: BindingClientConstructor = BindingClientConstructor;
