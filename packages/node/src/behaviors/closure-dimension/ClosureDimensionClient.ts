/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { ClosureDimension } from "@matter/types/clusters/closure-dimension";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const ClosureDimensionClientConstructor = ClientBehavior(ClosureDimension);
export interface ClosureDimensionClient extends InstanceType<typeof ClosureDimensionClientConstructor> {}
export interface ClosureDimensionClientConstructor extends Identity<typeof ClosureDimensionClientConstructor> {}
export const ClosureDimensionClient: ClosureDimensionClientConstructor = ClosureDimensionClientConstructor;
