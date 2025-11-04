/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/*** THIS FILE IS GENERATED, DO NOT EDIT ***/

import { DoorLock } from "#clusters/door-lock";
import { ClientBehavior } from "../../behavior/cluster/ClientBehavior.js";
import { Identity } from "#general";

export const DoorLockClientConstructor = ClientBehavior(DoorLock.Complete);
export interface DoorLockClient extends InstanceType<typeof DoorLockClientConstructor> {}
export interface DoorLockClientConstructor extends Identity<typeof DoorLockClientConstructor> {}
export const DoorLockClient: DoorLockClientConstructor = DoorLockClientConstructor;
