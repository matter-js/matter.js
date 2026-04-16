/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NoProviderError } from "@matter/general";

import { isBunjs, supportsSqlite } from "#util/runtimeChecks.js";
import type { DatabaseCreator } from "./SqliteTypes.js";

/**
 * Get the platform-appropriate SQLite database creator.
 *
 * Handles both ESM and CJS module formats via {@link findDefaultExport}.
 */
export async function platformDatabaseCreator(): Promise<DatabaseCreator> {
    if (!supportsSqlite()) {
        throw new NoProviderError("SQLite requires Node.js 22+ or Bun");
    }

    if (isBunjs()) {
        const module = await import("./platform/BunSqlite.js");
        return findDefaultExport(module, "createBunDatabase");
    }

    const module = await import("./platform/NodeJsSqlite.js");
    return findDefaultExport(module, "createNodeJsDatabase");
}

/**
 * Find named export from dynamically imported module.
 *
 * Handles both ESM and CJS module formats when using `await import()`:
 *
 * - **ESM**: `{ ExportName: [value] }`
 * - **CJS (wrapped)**: `{ default: { ExportName: [value] } }`
 * - **CJS (direct)**: `{ default: [value] }`
 */
export function findDefaultExport<T, N extends keyof T>(moduleLike: T, name: N): T[N] {
    return moduleLike[name] || (moduleLike as any).default?.[name] || (moduleLike as any).default;
}
