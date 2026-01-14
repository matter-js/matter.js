/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { findDefaultExport } from "#util/findDefaultExport.js"
import { isBunjs } from "#util/RuntimeChecks.js"
import type { StorageSqliteDisk } from "./StorageSqliteDisk.js"

/**
 * Create platform-specific SQLite storage
 * 
 * Automatically detects runtime (Bun vs Node.js) and returns appropriate implementation
 * 
 * @param path Database path (null for in-memory)
 * @param clear Clear database on initialization
 * @returns Platform-specific SQLite storage instance
 */
export async function createSqliteDisk(
  path: string | null,
  clear = false
): Promise<StorageSqliteDisk> {
  const isBun = isBunjs()

  if (isBun) {
    const module = await import("./BunSqliteDisk.js")
    // Handle both ESM and CJS module formats
    const BunSqliteDisk = findDefaultExport(module, "BunSqliteDisk")
    return new BunSqliteDisk(path, clear)
  } else {
    const module = await import("./NodeJsSqliteDisk.js")
    const NodeJsSqliteDisk = findDefaultExport(module, "NodeJsSqliteDisk")
    return new NodeJsSqliteDisk(path, clear)
  }
}

