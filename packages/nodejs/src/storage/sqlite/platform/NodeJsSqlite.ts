/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { DatabaseSync } from "node:sqlite";

import type { DatabaseLike } from "../SqliteTypes.js";

/**
 * Create a Node.js SQLite database.
 *
 * DO NOT IMPORT DIRECTLY — use {@link SqliteStorage.create} instead.
 */
export function createNodeJsDatabase(path: string): DatabaseLike {
    return new DatabaseSync(path) as DatabaseLike;
}
