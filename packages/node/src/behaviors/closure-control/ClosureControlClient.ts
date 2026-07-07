/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClosureControl } from "@matter/types/clusters/closure-control";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const ClosureControlClientConstructor = ClientBehavior(ClosureControl);
export interface ClosureControlClient extends InstanceType<typeof ClosureControlClientConstructor> {}
export interface ClosureControlClientConstructor extends Identity<typeof ClosureControlClientConstructor> {}
export const ClosureControlClient: ClosureControlClientConstructor = ClosureControlClientConstructor;
