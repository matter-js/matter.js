/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import { MatterAggregateError } from "#MatterError.js";
import { MaybePromise } from "../util/Promises.js";
import type { BaseStorageDriver, StorageType } from "./BaseStorageDriver.js";
import type { BlobStorageDriver } from "./BlobStorageDriver.js";
import type { StorageDriver } from "./StorageDriver.js";
import { StorageError } from "./StorageDriver.js";

/**
 * Interface for legacy storage drivers that support reading blob data alongside KV data.
 * Used during cross-type kv→blob migration to extract blobs from old combined drivers.
 */
export interface LegacyBlobSource {
    openBlob(contexts: string[], key: string): MaybePromise<Blob>;
}

const logger = new Logger("StorageMigrator");

/**
 * Type-aware storage migrator.  Handles KV-to-KV, blob-to-blob, and the legacy KV-to-blob cross-type
 * migration (extracting blob data from old combined KV+blob drivers).
 *
 * It does not modify or remove source data.
 */
export namespace StorageMigration {
    export interface MigrationSkipped {
        contexts: string[];
        key: string;
        error: string;
    }

    export interface MigrationResult {
        success: boolean;
        migratedCount: number;
        skippedCount: number;
        otherTypeKeysSkipped: number;
        skippedItems: MigrationSkipped[];
    }

    /**
     * Migrate storage from `source` to `target`.  The migration strategy is determined by the
     * drivers' {@link BaseStorageDriver.storageType storageType}:
     *
     * - **kv → kv**: copies KV data via `get`/`set`, skips blob remnants (undefined-value keys)
     * - **blob → blob**: copies blobs via `openBlob`/`writeBlobFromStream`
     * - **kv → blob**: cross-type extraction — reads blob data from a legacy KV driver that stored
     *   blobs alongside KV data (e.g. old `FileStorageDriver`).  Keys where `get()` returns a value
     *   are skipped (they're KV, not blobs).  Keys where `get()` returns `undefined` are treated as
     *   blobs and streamed to the blob target.
     * - **blob → kv**: not supported — throws
     */
    export async function migrate(source: BaseStorageDriver, target: BaseStorageDriver): Promise<MigrationResult> {
        const strategy = resolveStrategy(source.type, target.type);

        const result: MigrationResult = {
            success: true,
            migratedCount: 0,
            skippedCount: 0,
            otherTypeKeysSkipped: 0,
            skippedItems: [],
        };

        await migrateContext({ source, target, strategy, contexts: [], result });

        if (result.otherTypeKeysSkipped > 0) {
            logger.info(`[migrate] Skipped ${result.otherTypeKeysSkipped} keys not matching target type`);
        }

        result.success = result.skippedCount === 0;
        return result;
    }

    /**
     * Export migration result to log
     */
    export function resultToLog(result: MigrationResult) {
        const timestamp = new Date().toISOString();

        let logContent = `
    # Migration Log
    - Timestamp: ${timestamp}
    - Success: ${result.success}
    - Migrated: ${result.migratedCount}
    - Skipped: ${result.skippedCount}
    `.replace(/^\s+/gm, "");
        if (result.skippedCount > 0 && result.skippedItems.length > 0) {
            logContent += `\n## Skipped Items\n`;
            for (const item of result.skippedItems) {
                logContent += `- ${buildContextKeyLog(item.contexts, item.key)}: ${item.error}\n`;
            }
        }

        return logContent;
    }
}

type MigrationStrategy = "kv" | "blob" | "kv-to-blob";

function resolveStrategy(sourceType: StorageType, targetType: StorageType): MigrationStrategy {
    if (sourceType === targetType) {
        return sourceType;
    }
    if (sourceType === "kv" && targetType === "blob") {
        // Cross-type: extract blobs from legacy KV driver
        return "kv-to-blob";
    }
    throw new StorageError(`Cannot migrate from "${sourceType}" storage to "${targetType}" storage`);
}

interface MigrateArgs {
    source: BaseStorageDriver;
    target: BaseStorageDriver;
    strategy: MigrationStrategy;
    contexts: string[];
    result: StorageMigration.MigrationResult;
}

async function migrateContext(args: MigrateArgs) {
    const { source, target, strategy, contexts, result } = args;
    const keys = await source.keys(contexts);

    for (const key of keys) {
        try {
            switch (strategy) {
                case "kv":
                    await migrateKvKey(source as StorageDriver, target as StorageDriver, contexts, key, result);
                    break;

                case "blob":
                    await migrateBlobKey(
                        source as BlobStorageDriver,
                        target as BlobStorageDriver,
                        contexts,
                        key,
                        result,
                    );
                    break;

                case "kv-to-blob":
                    await extractBlobFromKv(
                        source as StorageDriver,
                        target as BlobStorageDriver,
                        contexts,
                        key,
                        result,
                    );
                    break;
            }
        } catch (err) {
            result.skippedCount += 1;
            result.skippedItems.push({
                contexts,
                key,
                error: err instanceof Error ? err.message : String(err),
            });
            logger.warn(`[migrate] Skipped '${buildContextKeyLog(contexts, key)}' entity: ${err}`);
        }
    }

    // Migrate sub-contexts recursively
    const subContexts = await source.contexts(contexts);
    const promises: Promise<void>[] = [];

    subContexts.forEach(subCon => {
        promises.push(
            migrateContext({
                ...args,
                contexts: [...contexts, subCon],
            }),
        );
    });

    await MatterAggregateError.allSettled(promises, "[migrate] Error migrating sub-contexts!");
}

/** KV → KV: copy value, skip blob remnants */
async function migrateKvKey(
    source: StorageDriver,
    target: StorageDriver,
    contexts: string[],
    key: string,
    result: StorageMigration.MigrationResult,
) {
    const value = await source.get(contexts, key);
    if (value === undefined) {
        // Legacy blob remnant in KV storage — skip
        result.otherTypeKeysSkipped++;
        return;
    }
    await target.set(contexts, key, value);
    result.migratedCount++;
}

/** Blob → Blob: stream blob data */
async function migrateBlobKey(
    source: { openBlob: BlobStorageDriver["openBlob"] },
    target: BlobStorageDriver,
    contexts: string[],
    key: string,
    result: StorageMigration.MigrationResult,
) {
    const blob = await source.openBlob(contexts, key);
    if (blob.size === 0) {
        return;
    }
    await target.writeBlobFromStream(contexts, key, blob.stream());
    result.migratedCount++;
}

/** KV → Blob (cross-type): extract blob data from legacy KV driver */
async function extractBlobFromKv(
    source: StorageDriver,
    target: BlobStorageDriver,
    contexts: string[],
    key: string,
    result: StorageMigration.MigrationResult,
) {
    const value = await source.get(contexts, key);
    if (value !== undefined) {
        // This is a KV key, not a blob — skip
        result.otherTypeKeysSkipped++;
        return;
    }
    // Key has no KV value — it's a blob in the legacy driver.  Read via LegacyBlobSource.
    if (!isLegacyBlobSource(source)) {
        result.otherTypeKeysSkipped++;
        return;
    }
    await migrateBlobKey(source, target, contexts, key, result);
}

function isLegacyBlobSource(driver: BaseStorageDriver): driver is StorageDriver & LegacyBlobSource {
    return "openBlob" in driver && typeof (driver as LegacyBlobSource).openBlob === "function";
}

function buildContextKeyLog(contexts: string[], key: string) {
    return `${contexts.join(".")}$${key}`;
}
