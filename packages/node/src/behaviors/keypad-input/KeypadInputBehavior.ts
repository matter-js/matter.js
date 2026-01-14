/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { KeypadInput } from "#clusters/keypad-input";
import { ClusterBehavior } from "../../behavior/cluster/ClusterBehavior.js";
import { KeypadInputInterface } from "./KeypadInputInterface.js";
import { Identity } from "#general";

/**
 * KeypadInputBehavior is the base class for objects that support interaction with {@link KeypadInput.Cluster}.
 */
export const KeypadInputBehaviorConstructor = ClusterBehavior
    .withInterface<KeypadInputInterface>()
    .for(KeypadInput.Cluster);

export interface KeypadInputBehaviorConstructor extends Identity<typeof KeypadInputBehaviorConstructor> {}
export const KeypadInputBehavior: KeypadInputBehaviorConstructor = KeypadInputBehaviorConstructor;
export interface KeypadInputBehavior extends InstanceType<KeypadInputBehaviorConstructor> {}
export namespace KeypadInputBehavior { export interface State extends InstanceType<typeof KeypadInputBehavior.State> {} }
