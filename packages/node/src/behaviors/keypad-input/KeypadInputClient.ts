/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { KeypadInput } from "#clusters/keypad-input";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const KeypadInputClientConstructor = ClientBehavior(KeypadInput.Complete);
export interface KeypadInputClient extends InstanceType<typeof KeypadInputClientConstructor> {}
export interface KeypadInputClientConstructor extends Identity<typeof KeypadInputClientConstructor> {}
export const KeypadInputClient: KeypadInputClientConstructor = KeypadInputClientConstructor;
