/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ValueSupervisor } from "../../../supervision/ValueSupervisor.js";

/**
 * If you invoke {@link ValueSupervisor.manage} on a non-collection value, this is the manage implementation you will
 * receive.
 *
 * Struct and list manager implementations optimize by bypassing PrimitiveManager.
 */
export const PrimitiveManager: ValueSupervisor.Manage = reference => reference;
