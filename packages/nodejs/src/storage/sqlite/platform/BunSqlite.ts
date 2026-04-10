/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "@matter/general";
// @ts-expect-error - bun:sqlite is only available in Bun runtime
import { constants, Database } from "bun:sqlite";

import type { DatabaseLike } from "../SqliteTypes.js";

const logger = Logger.get("BunSqlite");

/**
 * Create a Bun SQLite database.
 *
 * DO NOT IMPORT DIRECTLY — use {@link SqliteStorageDriver.create} instead.
 */
export function createBunDatabase(path: string): DatabaseLike {
    const db = new Database(path, {
        strict: true,
        create: true,
    });

    if (path === ":memory:") {
        return {
            prepare: db.prepare.bind(db),
            exec: db.exec.bind(db),
            close: db.close.bind(db),
        };
    }

    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");

    return {
        prepare: db.prepare.bind(db),
        exec: db.exec.bind(db),
        close: () => {
            try {
                // Bun persists the WAL file by default; clear the flag so it is removed after checkpoint
                db.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0);
            } catch (error) {
                logger.warn("Failed to clear WAL persistence flag:", error);
            }
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
