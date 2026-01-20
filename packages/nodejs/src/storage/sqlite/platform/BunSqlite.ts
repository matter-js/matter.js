/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SqliteStorage } from "../SqliteStorage.js"
// @ts-expect-error - bun:sqlite is only available in Bun runtime
import { Database } from "bun:sqlite"
// @ts-expect-error - Bun is only available in Bun runtime
import Bun from "bun"

/**
 * `StorageSqliteDisk` for Bun
 * 
 * DO NOT IMPORT DIRECTLY
 * (should import `PlatformSqlite.js`)
 */
export class BunSqlite extends SqliteStorage {
  constructor(path: string | null, clear = false) {
    super({
      databaseCreator: (path) => new Database(path, {
        strict: true,
        create: true,
      }),
      path,
      clear,
    })
  }

  override async clear(completely?: boolean) {
    await super.clear()
    if (completely ?? false) {
      this.close()
      await Bun.file(this.dbPath).delete()
      this.isInitialized = false
    }
  }
}