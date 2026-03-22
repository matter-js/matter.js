/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Chime } from "@matter/types/clusters/chime";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "@matter/general";

export const ChimeClientConstructor = ClientBehavior(Chime.Complete);
export interface ChimeClient extends InstanceType<typeof ChimeClientConstructor> {}
export interface ChimeClientConstructor extends Identity<typeof ChimeClientConstructor> {}
export const ChimeClient: ChimeClientConstructor = ChimeClientConstructor;
