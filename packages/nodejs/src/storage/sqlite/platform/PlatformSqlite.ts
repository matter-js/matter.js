/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { isBunjs } from "#util/runtimeChecks.js";
import type { SqliteStorage } from "../SqliteStorage.js";

/**
 * Create platform-specific SQLite storage
 *
 * Automatically detects runtime (Bun or Node.js) and returns appropriate implementation.
 */
export async function PlatformSqlite(path: string | null, clear = false): Promise<SqliteStorage> {
    const isBun = isBunjs();

    // Node.js is the primary target
    if (!isBun) {
        const module = await import("./NodeJsSqlite.js");
        const NodeJsSqlite = findDefaultExport(module, "NodeJsSqlite");
        return new NodeJsSqlite(path, clear);
    }

    // Bun runtime fallback
    const module = await import("./BunSqlite.js");
    const BunSqlite = findDefaultExport(module, "BunSqlite");
    return new BunSqlite(path, clear);
}

/**
 * Find default export from dynamically imported module.
 *
 * Handles both ESM and CJS module formats when using `await import()`:
 *
 * - **ESM**: `{ ExportName: [value] }`
 * - **CJS (wrapped)**: `{ default: { ExportName: [value] } }`
 * - **CJS (direct)**: `{ default: [value] }`
 *
 * @param moduleLike The imported module object
 * @param name The export name to find
 * @returns The exported value
 *
 * @example
 * ```typescript
 * const module = await import("./NodeJsSqlite.js")
 * const NodeJsSqlite = findDefaultExport(module, "NodeJsSqlite")
 * new NodeJsSqlite(path)
 * ```
 */
function findDefaultExport<T, N extends keyof T>(moduleLike: T, name: N): T[N] {
    return moduleLike[name] || (moduleLike as any).default?.[name] || (moduleLike as any).default;
}
