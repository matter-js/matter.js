/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Bytes, StorageMigrator } from "@matter/general"
import { createSqliteDisk, migrateDirectoryStorage, StorageBackendDisk } from "#storage/index.js"
import * as assert from "node:assert"
import { rm, stat, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

const TEST_SOURCE_LOCATION = resolve(tmpdir(), "matterjs-test-migration-source")
const TEST_TARGET_LOCATION = resolve(tmpdir(), "matterjs-test-migration-target.db")

const CONTEXTx1 = ["context"]
const CONTEXTx2 = [...CONTEXTx1, "subcontext"]
const CONTEXTx3 = [...CONTEXTx2, "subsubcontext"]

describe("StorageMigrator", () => {
  beforeEach(async () => {
    await rm(TEST_SOURCE_LOCATION, { recursive: true, force: true })
    await rm(TEST_TARGET_LOCATION, { force: true })
    await rm(`${TEST_SOURCE_LOCATION}_old`, { recursive: true, force: true })
    await rm(`${TEST_SOURCE_LOCATION}.migration.log`, { force: true })
  })

  after(async () => {
    await rm(TEST_SOURCE_LOCATION, { recursive: true, force: true })
    await rm(TEST_TARGET_LOCATION, { force: true })
    await rm(`${TEST_SOURCE_LOCATION}_old`, { recursive: true, force: true })
    await rm(`${TEST_SOURCE_LOCATION}.migration.log`, { force: true })
  })

  it("migrate in memory", async () => {
    // Setup source storage
    const source = await createSqliteDisk(null)
    await source.initialize()
    source.set(CONTEXTx1, "key1", "value1")
    source.set(CONTEXTx2, "key2", "value2")
    source.set(CONTEXTx3, { key3: "value3", key4: 42 })

    // Setup target storage
    const target = await createSqliteDisk(null)
    await target.initialize()

    // Migrate
    const result = await StorageMigrator.migrate(source, target)

    // Verify migration
    assert.ok(result.success)
    assert.equal(result.migratedCount, 4)
    assert.equal(result.skippedCount, 0)

    // Verify data in target
    assert.equal(target.get(CONTEXTx1, "key1"), "value1")
    assert.equal(target.get(CONTEXTx2, "key2"), "value2")
    assert.equal(target.get(CONTEXTx3, "key3"), "value3")
    assert.equal(target.get(CONTEXTx3, "key4"), 42)

    source.close()
    target.close()
  })

  it("migrate JSON values", async () => {
    // Setup source storage
    const source = new StorageBackendDisk(TEST_SOURCE_LOCATION)
    await source.initialize()

    await source.set(CONTEXTx1, "key1", "value1")
    await source.set(CONTEXTx2, "key2", "value2")
    await source.set(CONTEXTx3, { key3: "value3", key4: 42 })

    // Setup target storage
    const target = await createSqliteDisk(TEST_TARGET_LOCATION)
    await target.initialize()

    // Migrate
    const result = await migrateDirectoryStorage({
      path: TEST_SOURCE_LOCATION,
      storage: source,
    }, target)

    // Verify migration
    assert.ok(result.success)
    assert.equal(result.migratedCount, 4)
    assert.equal(result.skippedCount, 0)

    // Verify data in target
    assert.equal(target.get(CONTEXTx1, "key1"), "value1")
    assert.equal(target.get(CONTEXTx2, "key2"), "value2")
    assert.equal(target.get(CONTEXTx3, "key3"), "value3")
    assert.equal(target.get(CONTEXTx3, "key4"), 42)

    await source.close()
    target.close()
  })

  it("migrate Blob values", async () => {
    // Setup source storage
    const source = new StorageBackendDisk(TEST_SOURCE_LOCATION)
    await source.initialize()

    const blobData = new Uint8Array([1, 2, 3, 4, 5])
    const stream = new ReadableStream<Bytes>({
      start(controller) {
        controller.enqueue(blobData)
        controller.close()
      },
    })
    await source.writeBlobFromStream(CONTEXTx1, "blobkey", stream)

    // Setup target storage
    const target = await createSqliteDisk(TEST_TARGET_LOCATION)
    await target.initialize()

    // Migrate
    const result = await migrateDirectoryStorage({
      path: TEST_SOURCE_LOCATION,
      storage: source,
    }, target)

    // Verify migration
    assert.ok(result.success)
    assert.equal(result.migratedCount, 1)

    // Verify blob in target
    const blob = target.openBlob(CONTEXTx1, "blobkey")
    const reader = blob.stream().getReader()
    const { value } = await reader.read()
    assert.deepEqual(value, blobData)

    await source.close()
    target.close()
  })

  it.skip("migrate with string path", async () => {
    // Setup source storage
    const source = new StorageBackendDisk(TEST_SOURCE_LOCATION)
    await source.initialize()

    await source.set(CONTEXTx1, "key1", "value1")
    await source.set(CONTEXTx2, "key2", "value2")
    await source.set(CONTEXTx3, { key3: "value3", key4: 42 })
    await new Promise((res) => setTimeout(res, 30000))

    // Setup target storage
    const target = await createSqliteDisk(TEST_TARGET_LOCATION)
    await target.initialize()

    // Instantly close source storage
    await source.close()

    // Migrate with string path
    const result = await migrateDirectoryStorage(TEST_SOURCE_LOCATION, target)

    // Verify migration
    assert.ok(result.success)
    assert.equal(result.migratedCount, 4)
    assert.equal(result.skippedCount, 0)

    // Verify data in target
    assert.equal(target.get(CONTEXTx1, "key1"), "value1")
    assert.equal(target.get(CONTEXTx2, "key2"), "value2")
    assert.equal(target.get(CONTEXTx3, "key3"), "value3")
    assert.equal(target.get(CONTEXTx3, "key4"), 42)

    target.close()
  })

  it("migrate nested contexts", async () => {
    // Setup source storage with multiple nested contexts
    const source = new StorageBackendDisk(TEST_SOURCE_LOCATION)
    await source.initialize()
    await source.set(CONTEXTx1, "root", "rootValue")
    await source.set(CONTEXTx2, "sub", "subValue")
    await source.set(CONTEXTx3, "deep", "deepValue")

    // Setup target storage
    const target = await createSqliteDisk(TEST_TARGET_LOCATION)
    await target.initialize()

    // Migrate
    const result = await migrateDirectoryStorage({
      path: TEST_SOURCE_LOCATION,
      storage: source,
    }, target)

    // Verify migration
    assert.ok(result.success)
    assert.equal(result.migratedCount, 3)

    // Verify contexts exist in target
    expect(target.contexts([])).deep.equal(CONTEXTx1)
    expect(target.contexts(CONTEXTx1)).deep.equal(["subcontext"])
    expect(target.contexts(CONTEXTx2)).deep.equal(["subsubcontext"])

    await source.close()
    target.close()
  })

  it("rename source folder to _old", async () => {
    // Setup source storage
    const source = new StorageBackendDisk(TEST_SOURCE_LOCATION)
    await source.initialize()
    await source.set(CONTEXTx1, "key", "value")
    await source.close()

    // Reopen source for migration
    const sourceForMigration = new StorageBackendDisk(TEST_SOURCE_LOCATION)
    await sourceForMigration.initialize()

    // Setup target storage
    const target = await createSqliteDisk(TEST_TARGET_LOCATION)
    await target.initialize()

    // Migrate
    await migrateDirectoryStorage({
      path: TEST_SOURCE_LOCATION,
      storage: sourceForMigration,
    }, target)

    // Verify old path existscd
    const oldStat = await stat(`${TEST_SOURCE_LOCATION}_old`)
    assert.ok(oldStat.isDirectory())

    // Verify original path no longer exists
    await assert.rejects(async () => {
      await stat(TEST_SOURCE_LOCATION)
    })

    // Verify migration log
    const migrationLog = await readFile(`${TEST_SOURCE_LOCATION}.migration.log`)
    assert.ok(migrationLog.includes("# Migration Log"))

    await sourceForMigration.close()
    target.close()
  })

})
