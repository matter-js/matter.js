/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// @ts-expect-error - bun:sqlite is only available in Bun runtime
import { Database } from "bun:sqlite";

import type { DatabaseLike } from "../SqliteTypes.js";

/**
 * Create a Bun SQLite database.
 *
 * DO NOT IMPORT DIRECTLY — use {@link SqliteStorage.create} instead.
 */
export function createBunDatabase(path: string): DatabaseLike {
    return new Database(path, {
        strict: true,
        create: true,
    });
}
