/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { DatabaseSync } from "node:sqlite";

import { SqliteStorage } from "../SqliteStorage.js";
import { DatabaseLike } from "../SqliteTypes.js";

/**
 * `StorageSqliteDisk` for Node.js
 *
 * DO NOT IMPORT DIRECTLY
 * (should import `PlatformSqlite.js`)
 */
export class NodeJsSqlite extends SqliteStorage {
    constructor(path: string | null, clear = false) {
        super({
            databaseCreator: path => new DatabaseSync(path) as DatabaseLike,
            path,
            clear,
        });
    }
}
