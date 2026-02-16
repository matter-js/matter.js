# OTA Version-Keyed Storage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add software version to OTA storage keys so multiple versions coexist, eliminating race conditions and user-data loss.

**Architecture:** Change storage key from `{vid}.{pid}.{mode}` to `{vid}.{pid}.{mode}.{version}`. Add `"local"` mode for user-added files. Migrate existing data on startup. Clean up stale versions after DCL downloads.

**Tech Stack:** TypeScript, matter.js storage API (`StorageContext`), `PersistedFileDesignator` (auto-splits `.` into sub-contexts)

**Design doc:** `docs/plans/2026-02-16-ota-version-keyed-storage-design.md`

---

### Task 1: Update Types and Mode Constants in DclOtaUpdateService

The `mode` type appears in `OtaUpdateListEntry` and `FindOptions`. Update these to support the new `"local"` mode and version-aware storage.

**Files:**
- Modify: `packages/protocol/src/dcl/DclOtaUpdateService.ts:932-951`

**Step 1: Update `OtaUpdateListEntry.mode` type**

Change line 941 from:
```typescript
mode: "prod" | "test";
```
to:
```typescript
mode: "prod" | "test" | "local";
```

**Step 2: Add a mode type alias for reuse**

Near the top of the file (after line 39), add:
```typescript
export type OtaStorageMode = "prod" | "test" | "local";
```

Use this type in `OtaUpdateListEntry.mode` and elsewhere in subsequent tasks.

**Step 3: Update `FindOptions` to support mode filtering**

The `isProduction` boolean filter needs to accommodate three modes. Add an optional `mode` field alongside `isProduction` for backward compatibility:
```typescript
export interface FindOptions {
    vendorId?: number;
    productId?: number;
    /** @deprecated Use mode instead */
    isProduction?: boolean;
    mode?: OtaStorageMode;
    currentVersion?: number;
}
```

**Step 4: Update the filename regex**

Change line 53 from:
```typescript
const OTA_FILENAME_REGEX = /^[0-9a-f]+[./][0-9a-f]+[./](?:prod|test)$/i;
```
to support both old and new formats:
```typescript
const OTA_FILENAME_REGEX = /^[0-9a-f]+[./][0-9a-f]+[./](?:prod|test|local)(?:[./]\d+)?$/i;
```

**Step 5: Build and verify**

Run: `cd packages/protocol && npx matter-build`
Expected: Successful build (type errors in consuming code are expected and will be fixed in subsequent tasks)

**Step 6: Commit**

```
feat(ota): add OtaStorageMode type and update OTA types for version-keyed storage
```

---

### Task 2: Update `#fileName()` and `store()` in DclOtaUpdateService

Core storage changes: the filename now includes version, and `store()` accepts mode strings.

**Files:**
- Modify: `packages/protocol/src/dcl/DclOtaUpdateService.ts:322-368`

**Step 1: Update `#fileName()`**

Replace lines 322-324:
```typescript
#fileName(vid: number, pid: number, isProduction: boolean) {
    return `${vid.toString(16)}.${pid.toString(16)}.${isProduction ? "prod" : "test"}`;
}
```
with:
```typescript
#fileName(vid: number, pid: number, mode: OtaStorageMode, softwareVersion: number) {
    return `${vid.toString(16)}.${pid.toString(16)}.${mode}.${softwareVersion}`;
}
```

**Step 2: Update `store()` signature**

Replace line 329:
```typescript
async store(stream: ReadableStream<Uint8Array>, updateInfo: OtaUpdateInfo, isProduction = true) {
```
with:
```typescript
async store(
    stream: ReadableStream<Uint8Array>,
    updateInfo: OtaUpdateInfo,
    // TODO: Change default to "local" on next breaking release
    mode: boolean | OtaStorageMode = true,
) {
```

**Step 3: Add mode normalization at top of `store()`**

After `const storage = this.#storage!;` (line 333), add:
```typescript
if (typeof mode === "boolean") {
    mode = mode ? "prod" : "test";
}
```

**Step 4: Update filename generation in `store()`**

Replace line 337-338:
```typescript
// Generate filename with production/test indicator (version not included as we always use latest)
const filename = this.#fileName(vid, pid, isProduction);
```
with:
```typescript
const filename = this.#fileName(vid, pid, mode, softwareVersion);
```

**Step 5: Update diagnostic info in `store()`**

Replace line 346 `prod: isProduction,` with `mode,`.

**Step 6: Build and verify**

Run: `cd packages/protocol && npx matter-build`
Expected: Build errors in `downloadUpdate()` and `#findEntries()` methods that still use old `#fileName()` signature — these are fixed in the next tasks.

**Step 7: Commit**

```
feat(ota): update store() and #fileName() for version-keyed storage
```

---

### Task 3: Update `downloadUpdate()` in DclOtaUpdateService

This method calls `#fileName()` and `store()`. Update it to use the new signatures.

**Files:**
- Modify: `packages/protocol/src/dcl/DclOtaUpdateService.ts:380-458`

**Step 1: Update mode derivation**

Replace line 387:
```typescript
const isProduction = source === "dcl-prod";
```
with:
```typescript
const mode: OtaStorageMode = source === "dcl-prod" ? "prod" : source === "dcl-test" ? "test" : "local";
```

**Step 2: Update diagnostic info**

Replace line 393 `prod: isProduction,` with `mode,`.

**Step 3: Update filename generation**

Replace lines 396-398:
```typescript
// Generate filename with production/test indicator (a version not included as we always use latest)
const filename = this.#fileName(vid, pid, isProduction);
const fileDesignator = new PersistedFileDesignator(filename, storage);
```
with:
```typescript
const filename = this.#fileName(vid, pid, mode, softwareVersion);
const fileDesignator = new PersistedFileDesignator(filename, storage);
```

**Step 4: Update the `store()` call**

Replace line 451:
```typescript
return await this.store(response.body, updateInfo, isProduction);
```
with:
```typescript
return await this.store(response.body, updateInfo, mode);
```

**Step 5: Build and verify**

Run: `cd packages/protocol && npx matter-build`
Expected: Build errors remaining in `#findEntries()` and `delete()` — fixed next.

**Step 6: Commit**

```
feat(ota): update downloadUpdate() for version-keyed filenames
```

---

### Task 4: Update `#findVendorProductEntries()` and `#findEntries()` in DclOtaUpdateService

The find logic needs to enumerate mode sub-contexts and version keys instead of checking bare keys.

**Files:**
- Modify: `packages/protocol/src/dcl/DclOtaUpdateService.ts:725-844`

**Step 1: Rewrite `#findVendorProductEntries()`**

Replace the entire method (lines 781-806) with:
```typescript
async #findVendorProductEntries(productContext: StorageContext, options: DclOtaUpdateService.FindOptions) {
    const { isProduction, mode: filterMode } = options;

    const result = new Array<Omit<DclOtaUpdateService.OtaUpdateListEntry, "vendorId" | "productId" | "filename">>();

    // Determine which modes to check
    const modeContexts = await productContext.contexts();
    const validModes: OtaStorageMode[] = ["prod", "test", "local"];

    for (const modeStr of modeContexts) {
        if (!validModes.includes(modeStr as OtaStorageMode)) {
            continue;
        }
        const mode = modeStr as OtaStorageMode;

        // Apply mode/isProduction filter
        if (filterMode !== undefined && filterMode !== mode) {
            continue;
        }
        if (filterMode === undefined && isProduction !== undefined) {
            if (isProduction === true && mode !== "prod") continue;
            if (isProduction === false && mode === "prod") continue;
        }

        const modeContext = productContext.createContext(modeStr);
        const versionKeys = await modeContext.keys();

        for (const versionKey of versionKeys) {
            const fileDesignator = new PersistedFileDesignator(versionKey, modeContext);
            const entry = await this.#checkEntry(fileDesignator, options);
            if (entry !== undefined) {
                result.push({
                    ...entry,
                    mode,
                });
            }
        }
    }

    // Legacy migration support: also check for bare "prod"/"test" keys (old format)
    for (const legacyKey of ["prod", "test"] as const) {
        if (isProduction === true && legacyKey !== "prod") continue;
        if (isProduction === false && legacyKey !== "test") continue;
        if (filterMode !== undefined && filterMode !== legacyKey) continue;

        if (await productContext.has(legacyKey)) {
            const fileDesignator = new PersistedFileDesignator(legacyKey, productContext);
            const entry = await this.#checkEntry(fileDesignator, options);
            if (entry !== undefined) {
                result.push({
                    ...entry,
                    mode: legacyKey,
                });
            }
        }
    }

    return result;
}
```

**Step 2: Update `#findEntries()` filename generation**

In `#findEntries()` (lines 725-754), the `#fileName()` call on lines 735 and 748 needs to include the version. Since entries now carry `softwareVersion`, update these:

Replace line 735:
```typescript
filename: this.#fileName(vendorId, entry.productId, entry.mode === "prod"),
```
with:
```typescript
filename: this.#fileName(vendorId, entry.productId, entry.mode, entry.softwareVersion),
```

Same for line 748.

**Step 3: Update `#findVendorEntries()` similarly**

Same pattern — pass `entry.mode` and `entry.softwareVersion` to `#fileName()`.

**Step 4: Build and verify**

Run: `cd packages/protocol && npx matter-build`

**Step 5: Commit**

```
feat(ota): rewrite find logic to enumerate version-keyed sub-contexts
```

---

### Task 5: Update `delete()` in DclOtaUpdateService

The delete method needs to handle both old and new filename formats, and delete all versions in a mode or a specific version.

**Files:**
- Modify: `packages/protocol/src/dcl/DclOtaUpdateService.ts:877-929`

**Step 1: Update `delete()` for new mode parameter**

The method currently takes `isProduction?: boolean`. Update to also accept mode:
```typescript
async delete(options: {
    filename?: string;
    vendorId?: number;
    productId?: number;
    /** @deprecated Use mode instead */
    isProduction?: boolean;
    mode?: OtaStorageMode;
}) {
```

**Step 2: Update filename construction**

Replace lines 886-888:
```typescript
if (filename == undefined && vendorId !== undefined && productId !== undefined && isProduction !== undefined) {
    filename = this.#fileName(vendorId, productId, isProduction);
}
```
with logic that handles both the old boolean and new mode. When no specific version is provided, delete all versions for that mode by enumerating the mode context.

**Step 3: Rewrite the vendor-wide delete logic**

Replace the loop at lines 914-926 to enumerate mode sub-contexts and their version keys, deleting matching entries. Also handle legacy bare keys for backward compatibility.

**Step 4: Build and verify**

Run: `cd packages/protocol && npx matter-build`

**Step 5: Commit**

```
feat(ota): update delete() for version-keyed storage
```

---

### Task 6: Update `fileDesignatorForUpdate()` in DclOtaUpdateService

This method validates filenames and creates `PersistedFileDesignator` instances. It needs to accept both old and new formats.

**Files:**
- Modify: `packages/protocol/src/dcl/DclOtaUpdateService.ts:846-862`

**Step 1: The regex was already updated in Task 1**

The `OTA_FILENAME_REGEX` now accepts both `fff1.8000.prod` (old) and `fff1.8000.prod.3` (new). `PersistedFileDesignator` auto-splits by `.` into sub-contexts, so both formats create the correct storage path. No code change needed beyond the regex.

**Step 2: Verify manually**

Confirm that `new PersistedFileDesignator("fff1.8000.prod.3", storage)` creates contexts `[fff1, 8000, prod]` with key `"3"`.

**Step 3: Commit (if any changes needed)**

```
feat(ota): update fileDesignatorForUpdate for new filename format
```

---

### Task 7: Update `checkForUpdate()` source mapping in DclOtaUpdateService

The `checkForUpdate()` method infers source from stored mode. Update the source mapping for the `"local"` mode.

**Files:**
- Modify: `packages/protocol/src/dcl/DclOtaUpdateService.ts:195-287`

**Step 1: Update local update source mapping**

Replace line 233:
```typescript
source: localUpdates[0].mode === "prod" ? "dcl-prod" : "local",
```
with:
```typescript
source: localUpdates[0].mode === "prod" ? "dcl-prod" : localUpdates[0].mode === "test" ? "dcl-test" : "local",
```

**Step 2: Build and verify**

Run: `cd packages/protocol && npx matter-build`
Expected: Clean build for the protocol package.

**Step 3: Commit**

```
feat(ota): fix source mapping for three-mode storage
```

---

### Task 8: Add storage migration logic

Add a migration method that runs during construction to convert old bare keys to the new format.

**Files:**
- Modify: `packages/protocol/src/dcl/DclOtaUpdateService.ts` (constructor and new method)

**Step 1: Add migration method**

Add a private method `#migrateStorage()`:
```typescript
async #migrateStorage() {
    const storage = this.#storage!;
    const context = storage.context;

    for (const vendorHex of await context.contexts()) {
        const vendorContext = context.createContext(vendorHex);
        for (const productHex of await vendorContext.contexts()) {
            const productContext = vendorContext.createContext(productHex);
            const keys = await productContext.keys();

            for (const key of keys) {
                if (key !== "prod" && key !== "test") {
                    continue; // Not an old-format key
                }

                try {
                    // Read the old file to get the version
                    const oldDesignator = new PersistedFileDesignator(key, productContext);
                    const blob = await oldDesignator.openBlob();
                    const reader = blob.stream().getReader();
                    const header = await OtaImageReader.header(reader);

                    // Write to new location: mode context + version key
                    const modeContext = productContext.createContext(key);
                    const versionKey = header.softwareVersion.toString();
                    const newBlob = await oldDesignator.openBlob();
                    await modeContext.writeBlobFromStream(versionKey, newBlob.stream());

                    // Delete old key
                    await productContext.delete(key);

                    logger.info(
                        `Migrated OTA storage: ${vendorHex}.${productHex}.${key} -> ${vendorHex}.${productHex}.${key}.${versionKey}`,
                    );
                } catch (error) {
                    logger.warn(
                        `Failed to migrate OTA file ${vendorHex}.${productHex}.${key}, deleting corrupt entry:`,
                        error,
                    );
                    try {
                        await productContext.delete(key);
                    } catch {
                        // Ignore cleanup errors
                    }
                }
            }
        }
    }
}
```

**Step 2: Call migration in constructor**

In the construction callback (line 78-81), add the migration call after storage initialization:
```typescript
this.#construction = Construction(this, async () => {
    this.#storageManager = await environment.get(StorageService).open("ota");
    this.#storage = new ScopedStorage(this.#storageManager.createContext("bin"), "ota");
    await this.#migrateStorage();
});
```

**Step 3: Build and verify**

Run: `cd packages/protocol && npx matter-build`
Expected: Clean build.

**Step 4: Commit**

```
feat(ota): add storage migration from old to version-keyed format
```

---

### Task 9: Update SoftwareUpdateManager for version-aware serving

The `updateExistsFor()` method in `SoftwareUpdateManager` constructs `FileDesignator` from the filename. Since filenames now include version, this works naturally. But the `mode` filter needs updating.

**Files:**
- Modify: `packages/node/src/behavior/system/software-update/SoftwareUpdateManager.ts:285-364`

**Step 1: Update mode filter in `updateExistsFor()`**

Line 310 currently filters by:
```typescript
(this.state.allowTestOtaImages || mode !== "test"),
```
Update to also allow `"local"` mode:
```typescript
(this.state.allowTestOtaImages || (mode !== "test" && mode !== "local")) || mode === "local",
```

Wait — `"local"` files should always be available since the user explicitly added them. The filter should be:
```typescript
(mode === "local" || mode === "prod" || (this.state.allowTestOtaImages && mode === "test")),
```

**Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build across the monorepo.

**Step 3: Commit**

```
feat(ota): update SoftwareUpdateManager mode filtering for local files
```

---

### Task 10: Add cleanup logic to DclOtaUpdateService

After a DCL download stores a new version, clean up old versions in the same mode context (not `"local"`).

**Files:**
- Modify: `packages/protocol/src/dcl/DclOtaUpdateService.ts`

**Step 1: Add cleanup method**

Add after `store()`:
```typescript
/**
 * Clean up old versions in a mode context, keeping only the latest version.
 * Only applies to "prod" and "test" modes. "local" mode files are user-managed.
 */
async #cleanupOldVersions(vid: number, pid: number, mode: OtaStorageMode, keepVersion: number) {
    if (mode === "local") {
        return; // Never auto-delete user-added files
    }

    if (this.#storage === undefined) {
        return;
    }

    const context = this.#storage.context;
    const modeContext = context
        .createContext(vid.toString(16))
        .createContext(pid.toString(16))
        .createContext(mode);

    const versionKeys = await modeContext.keys();
    for (const versionKey of versionKeys) {
        const version = parseInt(versionKey, 10);
        if (isNaN(version) || version === keepVersion) {
            continue;
        }

        try {
            await modeContext.delete(versionKey);
            logger.debug(`Cleaned up old OTA version: ${vid.toString(16)}.${pid.toString(16)}.${mode}.${versionKey}`);
        } catch (error) {
            logger.warn(`Failed to clean up old OTA version ${versionKey}:`, error);
        }
    }
}
```

**Step 2: Call cleanup after successful store**

In `store()`, after the successful `logger.debug("Stored OTA image" ...)` line, add:
```typescript
if (mode !== "local") {
    await this.#cleanupOldVersions(vid, pid, mode, softwareVersion);
}
```

**Step 3: Build and verify**

Run: `cd packages/protocol && npx matter-build`

**Step 4: Commit**

```
feat(ota): add cleanup of old versions after DCL downloads
```

---

### Task 11: Update CLI commands in cmd_ota.ts

Update the shell commands for the new storage format and `"local"` mode.

**Files:**
- Modify: `packages/nodejs-shell/src/shell/cmd_ota.ts`

**Step 1: Update `ota add` to pass `"local"` mode**

In the `ota add` handler (around line 358), change:
```typescript
fd = await theNode.otaService.store(webStream, updateInfo);
```
to:
```typescript
fd = await theNode.otaService.store(webStream, updateInfo, "local");
```

**Step 2: Update `ota list` mode filter**

Update the `--mode` choices on line 250 from:
```typescript
choices: ["prod", "test"],
```
to:
```typescript
choices: ["prod", "test", "local"],
```

**Step 3: Update `ota delete` mode choices**

Update the `--mode` choices on line 391 from:
```typescript
choices: ["prod", "test"],
```
to:
```typescript
choices: ["prod", "test", "local"],
```

And change the default from `"prod"` to `undefined` (no default mode — require explicit choice when using `--vid`), or keep `"prod"` for backward compatibility.

**Step 4: Build and verify**

Run: `cd packages/nodejs-shell && npx matter-build`

**Step 5: Commit**

```
feat(ota): update CLI commands for version-keyed storage and local mode
```

---

### Task 12: Remove legacy find support from `#findVendorProductEntries()`

Once migration is confirmed working, the legacy bare-key fallback in `#findVendorProductEntries()` (added in Task 4) can remain for safety — it handles the case where migration hasn't run yet. This is a no-op task if the fallback is intentionally kept.

**Step 1: Verify the legacy fallback doesn't interfere with normal operation**

The fallback checks `productContext.has("prod")` / `productContext.has("test")` as keys. After migration, these keys won't exist (they've been moved to sub-contexts), so the fallback is a harmless no-op.

**Step 2: Add a code comment**

Add a comment above the legacy block:
```typescript
// Legacy support: check for bare "prod"/"test" keys from pre-migration storage.
// After migration these keys no longer exist, so this is a no-op for migrated storage.
// Can be removed in a future breaking release.
```

**Step 3: Commit**

```
docs(ota): document legacy find fallback for pre-migration storage
```

---

### Task 13: Full integration build and manual verification

**Step 1: Full monorepo build**

Run: `npm run build`
Expected: Clean build across all packages.

**Step 2: Run tests**

Run: `npm test` (or `cd packages/protocol && npx matter-test -w` and `cd packages/node && npx matter-test -w`)
Expected: All existing tests pass.

**Step 3: Verify the PersistedFileDesignator auto-splitting**

Confirm that the new filename format `fff1.8000.prod.3` produces the expected storage layout:
- Context path: `[fff1, 8000, prod]`
- Key: `"3"`

This is handled by `PersistedFileDesignator` constructor lines 35-39 which split on `.` and create sub-contexts.

**Step 4: Commit (if any fixes needed)**

```
fix(ota): address integration issues from version-keyed storage
```

---

### Task 14: Final commit and summary

**Step 1: Verify all changes**

Run `git log --oneline` to confirm all commits are in place.

**Step 2: Verify no regressions**

Run full build + tests one more time.

**Step 3: Done**

Summary of changes across all tasks:
- `DclOtaUpdateService.ts`: New `OtaStorageMode` type, `#fileName()` includes version, `store()` accepts mode string (backward-compat), `find()` enumerates sub-contexts, `delete()` handles mode contexts, migration on startup, cleanup after DCL downloads
- `SoftwareUpdateManager.ts`: Mode filter updated for `"local"` files
- `cmd_ota.ts`: `ota add` uses `"local"` mode, CLI choices updated
- `OtaSoftwareUpdateProviderServer.ts`: No direct changes needed — it delegates to `SoftwareUpdateManager.updateExistsFor()` which returns the correctly versioned `FileDesignator`
