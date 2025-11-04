/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { OnOff } from "#clusters/on-off";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const OnOffClientConstructor = ClientBehavior(OnOff.Complete);
export interface OnOffClient extends InstanceType<typeof OnOffClientConstructor> {}
export interface OnOffClientConstructor extends Identity<typeof OnOffClientConstructor> {}
export const OnOffClient: OnOffClientConstructor = OnOffClientConstructor;
