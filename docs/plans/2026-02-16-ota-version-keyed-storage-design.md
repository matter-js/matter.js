# OTA Version-Keyed Storage Design

## Problem

The OTA update storage uses `{vid}.{pid}.{prod|test}` as the storage key, with no version component. This causes three issues:

1. **Multi-node fleet conflict:** Nodes at different firmware versions need different update files simultaneously (e.g., node A needs v2->v3, node B needs v3->v4). Only one file can be stored per vid/pid/mode, so only one upgrade path is available at a time.

2. **Version replacement during transfer:** A new version appearing on DCL between `queryImage` and BDX download completion can overwrite the file being served. While open file handles likely prevent mid-transfer corruption, the metadata mismatch creates unnecessary failures.

3. **User-added file overwrite:** When users manually add two different versions for the same vid/pid via `ota add` or `otaService.store()`, only the last one survives. Users expect all added files to persist.

## Solution: Version-Keyed Storage (Option B)

Include the software version in the storage key. Multiple versions coexist per vid/pid/mode. Add cleanup to remove stale versions and migrate existing stored files.

## Storage Hierarchy

### Current Structure

```
ota/
  {vid_hex}/
    {pid_hex}/
      "prod"    <- key (single file, overwritten on each download)
      "test"    <- key (single file, covers both test-DCL and user-added)
```

### New Structure

```
ota/
  {vid_hex}/
    {pid_hex}/
      prod/           <- sub-context (DCL production)
        {version}     <- key (e.g. "3", "4")
      test/           <- sub-context (DCL test)
        {version}
      local/          <- sub-context (user-added)
        {version}
```

### Three Modes

| Mode    | Source                     | Auto-cleanup | Notes                              |
|---------|----------------------------|--------------|-------------------------------------|
| `prod`  | Production DCL downloads   | Yes          | Keep latest + in-use               |
| `test`  | Test DCL downloads         | Yes          | Keep latest + in-use               |
| `local` | User-added via `ota add`   | No           | User-managed, only `ota delete`    |

The current code conflates test-DCL and user-added files under `"test"`. The new `"local"` mode properly distinguishes user-added files. The `OtaUpdateSource` type (`"local" | "dcl-prod" | "dcl-test"`) maps cleanly: `prod` -> `"dcl-prod"`, `test` -> `"dcl-test"`, `local` -> `"local"`.

## API Changes

### `DclOtaUpdateService.store()` Signature

Backward-compatible change — accepts boolean (old) or string (new):

```typescript
async store(
    stream: ReadableStream<Uint8Array>,
    updateInfo: OtaUpdateInfo,
    // TODO: Change default to "local" on next breaking release
    mode: boolean | "prod" | "test" | "local" = true
) {
    if (typeof mode === "boolean") {
        mode = mode ? "prod" : "test";
    }
    // ...
}
```

- Existing callers passing `true`/`false` continue to work unchanged.
- DCL download paths updated to pass `"prod"` / `"test"` strings.
- User-facing paths (`ota add`, `updateInfoFromStream`) pass `"local"` explicitly.

### `#fileName()` Change

```typescript
// Before
#fileName(vid: number, pid: number, isProduction: boolean) {
    return `${vid.toString(16)}.${pid.toString(16)}.${isProduction ? "prod" : "test"}`;
}

// After
#fileName(vid: number, pid: number, mode: "prod" | "test" | "local", softwareVersion: number) {
    return `${vid.toString(16)}.${pid.toString(16)}.${mode}.${softwareVersion}`;
}
```

### Storage Key Validation Regex

Update from:
```
/^[0-9a-f]+[./][0-9a-f]+[./](?:prod|test)$/i
```
To:
```
/^[0-9a-f]+[./][0-9a-f]+[./](?:prod|test|local)[./]\d+$/i
```

Also accept old format (without version) for backward compatibility in `ota delete` / `ota info`.

### `#findVendorProductEntries()` Change

Currently checks `has("prod")` / `has("test")` as keys. Changes to:

- Use `contexts()` to discover mode sub-contexts (`"prod"`, `"test"`, `"local"`)
- Within each mode context, use `keys()` to enumerate version keys
- For each version key, read the OTA header to get version metadata

### CLI Commands

| Command      | Change                                                                     |
|--------------|----------------------------------------------------------------------------|
| `ota list`   | Shows `fff1.8000.prod.3`, `fff1.8000.local.4`, etc.                       |
| `ota add`    | Stores under `"local"` mode, output includes version in key               |
| `ota delete` | Accepts `fff1.8000.prod` (all versions) or `fff1.8000.prod.3` (specific)  |
| `ota info`   | Accepts new format                                                         |

## OTA Provider: Serving the Right Version

### Current Flow

`queryImage()` -> `checkUpdateAvailable()` -> finds single file by vid/pid/mode -> serves via BDX.

### New Flow

`queryImage()` -> `checkUpdateAvailable()` -> finds **all** stored versions for vid/pid -> selects best version based on:

- Node's current `softwareVersion` (from query request)
- Each stored file's `minApplicableSoftwareVersion` / `maxApplicableSoftwareVersion` (from OTA header)
- Stored file's `softwareVersion` must be > node's current version

The selected version's specific file designator (e.g. `prod/4`) is passed to BDX. Even if a new version is downloaded to `prod/5` mid-transfer, the BDX session still references `prod/4`.

### In-Use Tracking

`OtaUpdateInProgressDetails` gains a `fileDesignator` field (or version + mode) so cleanup knows which version file is actively being served.

This is the key architectural win: the file reference in the BDX session is immutable per version. No race condition possible because each version is a distinct storage entry.

## Cleanup Logic

**Strategy: keep latest + in-use, delete the rest.**

- Applies to `"prod"` and `"test"` modes only. `"local"` files are never auto-deleted.
- After `store()` completes for a DCL download, scan sibling versions in that mode context.
- If a version has no active BDX transfer referencing it and is not the latest, delete it.
- Always keep the latest version (highest version number).

**Trigger points:**

1. After `store()` completes for a DCL download — clean sibling versions in that mode context.
2. After a BDX transfer completes/fails — check if the version it served can now be cleaned.
3. On migration (one-time) — no cleanup, just migrate what's there.

**In-use check:** The existing `inProgressDetails` map tracks active transfers. With the added `fileDesignator` field, cleanup can determine whether any active transfer references a given version.

## Migration

### When

On first access to OTA storage during `DclOtaUpdateService` initialization.

### Detection

Scan each `{vid}/{pid}` context. If `keys()` returns `"prod"` or `"test"` (old format bare keys), migration is needed. The `StorageContext` API cleanly separates keys (`has()`, `keys()`) from sub-contexts (`contexts()`), so there is no ambiguity.

### Steps

1. Iterate vendor contexts -> product contexts.
2. For each product context, check `keys()` for `"prod"` / `"test"` (old format).
3. For each old key found:
   - Read the file via `PersistedFileDesignator`.
   - Parse OTA header to extract `softwareVersion`.
   - Create mode sub-context: `productContext.createContext("test")` (or `"prod"`).
   - Write file data to version key within that sub-context.
   - Delete old bare key.
4. Existing `"test"` keys migrate to `"test"` sub-context (not `"local"` — no retroactive distinction).

### Error Handling

If header parsing fails for a stored file (corrupted), log a warning and delete the old key.

### Idempotency

If migration is interrupted, the next startup re-detects remaining bare keys and re-migrates. Write-new-then-delete-old ordering prevents partial state.

## Key Files

| File | Changes |
|------|---------|
| `packages/protocol/src/dcl/DclOtaUpdateService.ts` | Storage key, store(), find, delete, migration, cleanup |
| `packages/node/src/behaviors/ota-software-update-provider/OtaSoftwareUpdateProviderServer.ts` | Version-specific file designator in BDX, in-use tracking |
| `packages/node/src/behavior/system/software-update/SoftwareUpdateManager.ts` | Version selection logic, cleanup triggers |
| `packages/nodejs-shell/src/shell/cmd_ota.ts` | CLI command updates for new key format, "local" mode |
