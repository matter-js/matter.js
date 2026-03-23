/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Binding } from "@matter/types/clusters/binding";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const BindingClientConstructor = ClientBehavior(Binding);
export interface BindingClient extends InstanceType<typeof BindingClientConstructor> {}
export interface BindingClientConstructor extends Identity<typeof BindingClientConstructor> {}
export const BindingClient: BindingClientConstructor = BindingClientConstructor;
