/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { rm } from "node:fs/promises";
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

    override async clear(completely?: boolean) {
        await super.clear();
        if (completely ?? false) {
            this.close();
            await rm(this.dbPath, { force: true });
            this.isInitialized = false;
        }
    }
}
