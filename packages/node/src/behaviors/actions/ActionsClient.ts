/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { Actions } from "#clusters/actions";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const ActionsClientConstructor = ClientBehavior(Actions.Complete);
export interface ActionsClient extends InstanceType<typeof ActionsClientConstructor> {}
export interface ActionsClientConstructor extends Identity<typeof ActionsClientConstructor> {}
export const ActionsClient: ActionsClientConstructor = ActionsClientConstructor;
