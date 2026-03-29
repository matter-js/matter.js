/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DoorLock } from "@matter/types/clusters/door-lock";
import { UserDoorLockServer } from "./UserDoorLockServer.js";

/**
 * Default DoorLock server with no features enabled. Use `.with()` to enable features.
 */
export class DoorLockServer extends UserDoorLockServer.for(DoorLock) {}
