/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

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
 * const module = await import("./NodeJsSqliteDisk.js")
 * const NodeJsSqliteDisk = findDefaultExport(module, "NodeJsSqliteDisk")
 * new NodeJsSqliteDisk(path)
 * ```
 */
export function findDefaultExport<T, N extends keyof T>(moduleLike: T, name: N): T[N] {
  return moduleLike[name] || (moduleLike as any).default?.[name] || (moduleLike as any).default
}