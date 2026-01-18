/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js"
import { MatterAggregateError } from "#MatterError.js"
import type { Storage } from "./Storage.js"

const logger = new Logger("StorageMigrator")

/**
 * A simple storage migrator of storage.
 * 
 * It does not modify or remove source data.
 */
export namespace StorageMigration {
  export interface MigrationSkipped {
    contexts: string[]
    key: string
    error: string
  }

  export interface MigrationResult {
    success: boolean
    migratedCount: number
    skippedCount: number
    skippedItems: MigrationSkipped[]
  }

  /**
   * Migrate storage from `source` to `target`.
   */
  export async function migrate(source: Storage, target: Storage): Promise<MigrationResult> {
    const result = {
      success: true,
      migratedCount: 0,
      skippedCount: 0,
      skippedItems: [],
    }

    // Migrate all contexts recursively
    await migrateContext({
      source,
      target,
      contexts: [],
      result,
    })

    // Result
    result.success = result.skippedCount === 0
    return result
  }

  /**
   * Export migration result to log
   */
  export function resultToLog(result: MigrationResult) {
    const timestamp = new Date().toISOString()

    let logContent = `
    # Migration Log
    - Timestamp: ${timestamp}
    - Success: ${result.success}
    - Migrated: ${result.migratedCount}
    - Skipped: ${result.skippedCount}
    `.replace(/^\s+/gm, "")
    if (result.skippedCount > 0 && result.skippedItems.length > 0) {
      logContent += `\n## Skipped Items\n`
      for (const item of result.skippedItems) {
        logContent += `- ${buildContextKeyLog(item.contexts, item.key)}: ${item.error}\n`
      }
    }

    return logContent
  }

}

/**
  * Migrate a specific context and its sub-contexts recursively
  */
async function migrateContext(args: {
  source: Storage,
  target: Storage,
  contexts: string[],
  result: StorageMigration.MigrationResult,
}) {
  const { source, target, contexts, result } = args
  const keys = await source.keys(contexts)

  for (const key of keys) {
    try {
      const value = await source.get(contexts, key)
      if (value === undefined) {
        // Blob
        const blob = await source.openBlob(contexts, key)
        if (blob.size === 0) {
          continue
        }

        const stream = blob.stream()
        await target.writeBlobFromStream(contexts, key, stream)

        result.migratedCount += 1
        continue
      }
      // Json
      target.set(contexts, key, value)
      result.migratedCount += 1
    } catch (err) {
      result.skippedCount += 1
      result.skippedItems.push({
        contexts,
        key,
        error: err instanceof Error ? err.message : String(err),
      })
      logger.warn(`[migrate] Skipped '${buildContextKeyLog(contexts, key)}' entity: ${err}`)
    }
  }

  // Migrate subcontext recursively
  const subContexts = await source.contexts(contexts)
  const promises: Promise<void>[] = []

  subContexts.forEach((subCon) => {
    promises.push(
      migrateContext({
        ...args,
        contexts: [...contexts, subCon],
      })
    )
  })

  // Promise.all with try catch
  await MatterAggregateError.allSettled(
    promises, "[migrate] Error migrating sub-contexts!")
}

function buildContextKeyLog(contexts: string[], key: string) {
  return `${contexts.join(".")}$${key}`
}
