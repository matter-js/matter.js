/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { DatabaseLike, StorageSqliteDisk } from "./StorageSqliteDisk.js";
import { DatabaseSync } from "node:sqlite"

export class NodeJsSqliteDisk extends StorageSqliteDisk {
  constructor(path: string | null, clear = false) {
    super({
      databaseCreator: (path) => new DatabaseSync(path) as DatabaseLike,
      path,
      clear,
    })
  }
}
