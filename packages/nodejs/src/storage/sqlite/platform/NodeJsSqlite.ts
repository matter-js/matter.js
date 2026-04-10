/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { Logger } from "@matter/general";
import { DatabaseSync } from "node:sqlite";

import type { DatabaseLike } from "../SqliteTypes.js";

const logger = Logger.get("NodeJsSqlite");

/**
 * Create a Node.js SQLite database.
 *
 * DO NOT IMPORT DIRECTLY — use {@link SqliteStorageDriver.create} instead.
 */
export function createNodeJsDatabase(path: string): DatabaseLike {
    const db = new DatabaseSync(path);

    // Cast needed: node:sqlite's StatementSync doesn't satisfy DatabaseLike's generic prepare signature
    const prepare = db.prepare.bind(db) as DatabaseLike["prepare"];

    if (path === ":memory:") {
        return {
            prepare,
            exec: db.exec.bind(db),
            close: db.close.bind(db),
        };
    }

    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");

    return {
        prepare,
        exec: db.exec.bind(db),
        close: () => {
            try {
                db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
            } catch (error) {
                logger.warn("WAL checkpoint failed, WAL will be replayed on next open:", error);
            } finally {
                db.close();
            }
        },
    };
}
