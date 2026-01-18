/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
/// <reference types="@types/bun" />

import { StorageSqliteDisk } from "./StorageSqliteDisk.js"
import { Database } from "bun:sqlite"

export class BunSqliteDisk extends StorageSqliteDisk {
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
}