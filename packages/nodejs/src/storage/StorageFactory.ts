/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { supportsSqlite } from "#util/runtimeChecks.js"
import { Logger, StorageError, StorageMigration, toJson } from "@matter/general"
import { StorageBackendDisk } from "./fs/StorageBackendDisk.js"
import { PlatformSqlite } from "./sqlite/index.js"
import { lstat, mkdir, writeFile, rename } from "node:fs/promises"
import { resolve } from "node:path"

const logger = new Logger("StorageFactory")

/**
 * Factory for creating storage backends with automatic migration support.
 * 
 * Provides a unified interface for creating different storage implementations
 * (file-based, SQLite) with seamless migration between storage types.
 * 
 * @see {@link StorageType} for available storage types
 * @see {@link create} for creating storage instances
 */
export namespace StorageFactory {

  /**
   * Storage Types which is implemented.
   */
  // Note: Only use lowercase of enum value.
  export enum StorageType {
    FILE = "file",
    SQLITE = "sqlite"
  }

  const StorageTypes: StorageType[] = [
    StorageType.FILE, StorageType.SQLITE,
  ]

  /**
   * Creates a storage instance with automatic migration support.
   * 
   * This is the main entry point for creating storage backends.
   * It handles:
   * - Directory creation if not exists
   * - Automatic migration from other storage types
   * - Backup of original data
   */
  export async function create(args: {
    driver: StorageType | string,
    rootDir: string,
    namespace: string,
    clear?: boolean,
  }) {
    const { driver, namespace } = args
    const rootDir = resolve(args.rootDir)
    const clear = args.clear ?? false
    const type = getStorageType(driver)

    // Ensure rootDir exists
    if (!await exists(rootDir)) {
      await mkdir(rootDir, { recursive: true })
    }

    const path = getRealPath(
      type, rootDir, namespace
    )

    // No migrate if not exists or clear = true
    if (clear || await exists(path)) {
      return await createRaw(type, path, clear)
    }

    // Start migrate
    const storage = await createRaw(type, path, false)
    for (const otherType of StorageTypes) {
      if (type === otherType) {
        continue
      }
      const otherPath = getRealPath(
        otherType, rootDir, namespace
      )
      if (!await hasStorage(otherType, otherPath)) {
        continue
      }

      try {
        const otherStorage = await createRaw(otherType, otherPath, false)
        const migrationResult = await StorageMigration.migrate(otherStorage, storage)

        // Create result dir
        const resultDir = resolve(rootDir, ".migrations",
          getResultDirName(otherType, type)
        )
        await mkdir(resultDir, { recursive: true })

        // Export log
        await writeFile(
          resolve(resultDir, "migration.log"),
          StorageMigration.resultToLog(migrationResult),
        )
        // Export metadata
        await writeFile(
          resolve(resultDir, "metadata.json"),
          toJson(getMetadata({
            fromType: otherType,
            fromPath: otherPath,
            toType: type,
            toPath: path,
            result: migrationResult,
          }), 4)
        )
        // Move to migration dir
        const moveToPath = getRealPath(otherType, resultDir, namespace)
        await rename(otherPath, moveToPath)
        // Logging
        logger.info(`[migrate] '${namespace}' migration from '${otherType}' to '${type}' complete!`)
      } catch (err) {
        const errorMessage = (err as Error)?.message ?? String(err)
        logger.error(
          `[migrate] Failed to migrate '${namespace}' from ${otherType} to ${type}!\nError: ${errorMessage}`
        )
      }
    }

    return storage
  }

  /**
   * Create storage backend without migration
   */
  async function createRaw(type: StorageType, path: string, clear: boolean) {
    const normalizedType = type.toLowerCase()

    // SQLite
    if (normalizedType === StorageType.SQLITE) {
      if (!supportsSqlite()) {
        // Throwing error should be better than fallback
        throw new Error(
          `SQLite storage is not supported in this environment.
          Node.js v22+ is required for SQLite support.
          Current version: ${process.version}
          `.replace(/\n\s+/g, "\n")
        )
      }
      return await PlatformSqlite(path, clear)
    }

    // File storage
    if (normalizedType === StorageType.FILE) {
      return new StorageBackendDisk(path, clear)
    }

    // Not implemented
    // Anyway this shouldn't be happen in production.
    throw new Error(
      `'${type}' storage type is not implemented.`
    )
  }

  /**
   * Check if storage exists at the given path.
   * 
   * Path should be `getRealPath` instead of namespace path!
   */
  async function hasStorage(type: StorageType, path: string): Promise<boolean> {

    try {
      const pathStat = await lstat(path)

      switch (type) {
        case StorageType.FILE:
          return pathStat.isDirectory()
        case StorageType.SQLITE:
          return pathStat.isFile()
        default:
          return false
      }
    } catch (err) {
      // ENOENT or other errors - storage doesn't exist
      return false
    }
  }

  /**
   * Get name of backup directory
   */
  function getResultDirName(fromType: StorageType, toType: StorageType) {
    const timestamp = new Date().toISOString()
      .slice(0, 19) // 2026-01-18T09:45:00
      .replace(/[-:]/g, "")
      .replace("T", "_")

    return `${timestamp}_${fromType}2${toType}`
  }

  /**
   * Get metadata information of migration.
   */
  function getMetadata(args: {
    fromType: StorageType,
    fromPath: string,
    toType: StorageType,
    toPath: string,
    result: StorageMigration.MigrationResult
  }) {
    const migrationResult = args.result
    return {
      version: "1.0.0",
      timestamp: Date.now(),
      source: {
        type: args.fromType,
        path: args.fromPath,
      },
      target: {
        type: args.toType,
        path: args.toPath,
      },
      result: {
        success: migrationResult.success,
        migratedCount: migrationResult.migratedCount,
        skippedCount: migrationResult.skippedCount,
        totalItems: migrationResult.migratedCount + migrationResult.skippedCount,
      },
    }
  }

  function getStorageType(inputType: string) {
    for (const storageType of StorageTypes) {
      if (storageType === inputType.toLowerCase()) {
        return storageType
      }
    }
    throw new StorageError(`Unknown '${inputType}' type storage!`)
  }

  function getRealPath(type: StorageType, rootDir: string, namespaces: string | string[]) {
    const namespaceArr = typeof namespaces === "string" ? [namespaces] : namespaces

    switch (type) {
      case StorageType.FILE:
        return resolve(rootDir, ...namespaceArr)
      case StorageType.SQLITE:
        const lastIndex = namespaceArr.length - 1
        namespaceArr[lastIndex] += ".db"
        return resolve(rootDir, ...namespaceArr)
      default:
        throw new Error(`NOT IMPLEMENTED ${type} type.`)
    }
  }

  async function exists(path: string) {
    try {
      await lstat(resolve(path))
      return true
    } catch (err) {
      return false
    }
  }
}