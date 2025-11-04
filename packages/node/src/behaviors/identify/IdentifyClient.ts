/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Identify } from "#clusters/identify";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const IdentifyClientConstructor = ClientBehavior(Identify.Complete);
export interface IdentifyClient extends InstanceType<typeof IdentifyClientConstructor> {}
export interface IdentifyClientConstructor extends Identity<typeof IdentifyClientConstructor> {}
export const IdentifyClient: IdentifyClientConstructor = IdentifyClientConstructor;
