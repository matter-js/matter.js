/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger, MigrationResult, Storage, StorageMigrator } from "@matter/general"
import fs from "node:fs/promises"
import { StorageBackendDisk } from "#storage/index.js"

const logger = new Logger("migrateDirectory")

/**
 * Migrate directory(string path/StorageBackendDisk) to target
 * 
 * And rename directory with `_old` suffix.
 */
export async function migrateDirectoryStorage(directory: {
  path: string,
  storage?: StorageBackendDisk,
} | string, target: Storage): Promise<MigrationResult> {

  let migrationResult: MigrationResult = {
    success: false,
    migratedCount: 0,
    skippedCount: 0,
    skippedItems: [],
  }

  // open storageDisk
  let storageDisk: StorageBackendDisk
  let path: string
  let shouldClose = false
  if (typeof directory === "string" || directory.storage == null) {
    if (typeof directory === "string") {
      path = directory
    } else {
      path = directory.path
    }

    // Check directory exists
    try {
      if (!(await fs.lstat(path)).isDirectory()) {
        return migrationResult
      }
    } catch (err) {
      const typedError = err as { code?: string }
      if (typedError?.code === "ENOENT") {
        // skip without logging
        return migrationResult
      }
      logger.warn(`[migrate] Migration failed in '${path}: ${err}'`)
      throw err
    }
    storageDisk = new StorageBackendDisk(path)
    await storageDisk.initialize()
    shouldClose = true
  } else {
    storageDisk = directory.storage
    path = directory.path
  }

  try {
    migrationResult = await StorageMigrator.migrate(storageDisk, target)
    await fs.writeFile(
      `${path}.migration.log`,
      StorageMigrator.resultToLog(migrationResult),
    )
    await fs.rename(path, `${path}_old`)
    logger.info(`[migrate] Migration of '${path}' complete!`)
    return migrationResult
  } catch (err) {
    migrationResult.success = false
    logger.error(`[migrate] '${path}' Migration failed: ${err}`)
  } finally {
    // close
    if (shouldClose) {
      await storageDisk.close()
    }
  }
  return migrationResult
}