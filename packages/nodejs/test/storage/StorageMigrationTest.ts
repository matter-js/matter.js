/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Storage, Bytes } from "@matter/general"
import { StorageFactory, StorageType } from "#storage/index.js"
import * as assert from "node:assert"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

const TEST_STORAGE_LOCATION = resolve(tmpdir(), "matterjs-test-storage")

const CONTEXTx1 = ["context"]
const CONTEXTx2 = [...CONTEXTx1, "subcontext"]
const CONTEXTx3 = [...CONTEXTx2, "subsubcontext"]


describe("StorageMigration", async () => {
  // init
  await mkdir(TEST_STORAGE_LOCATION, { recursive: true })

  const testPairs = [{
    source: StorageType.FILE,
    target: StorageType.SQLITE,
  }, {
    source: StorageType.SQLITE,
    target: StorageType.FILE,
  }]

  for (const pair of testPairs) {
    describe(`${pair.source} to ${pair.target}`, () => {
      const { source, target } = pair
      const sourceInfo = {
        driver: source,
        rootDir: TEST_STORAGE_LOCATION,
        namespace: `test_${source}to${target}`,
      }
      const targetInfo = {
        driver: target,
        rootDir: TEST_STORAGE_LOCATION,
        namespace: `test_${source}to${target}`,
      }

      let sourceStorage: Storage
      let targetStorage: Storage | null = null
      // BeforeEach
      beforeEach(async () => {
        if (sourceStorage != null) {
          await sourceStorage.close()
          await StorageFactory.remove(sourceInfo)
        }
        sourceStorage = await StorageFactory.create(sourceInfo)
      })

      afterEach(async () => {
        await targetStorage?.close()
        targetStorage = null
        await StorageFactory.remove(targetInfo)
      })

      // TEST START

      it("migrate check of context-key with json value", async () => {
        // Setup source storage
        await sourceStorage.set(CONTEXTx1, "key1", "value1")
        await sourceStorage.set(CONTEXTx2, "key2", "value2")
        await sourceStorage.set(CONTEXTx3, { key3: "value3", key4: 42 })

        // Setup target storage
        targetStorage = await StorageFactory.create(targetInfo)

        // Verify data in target
        assert.equal(await targetStorage.get(CONTEXTx1, "key1"), "value1")
        assert.equal(await targetStorage.get(CONTEXTx2, "key2"), "value2")
        assert.equal(await targetStorage.get(CONTEXTx3, "key3"), "value3")
        assert.equal(await targetStorage.get(CONTEXTx3, "key4"), 42)
      })

      it("migrate check of context-key with blob", async () => {
        // Setup source storage
        const blobData = new Uint8Array([1, 2, 3, 4, 5])
        const stream = new ReadableStream<Bytes>({
          start(controller) {
            controller.enqueue(blobData)
            controller.close()
          },
        })
        await sourceStorage.writeBlobFromStream(CONTEXTx1, "blobkey", stream)

        // Setup target storage
        targetStorage = await StorageFactory.create(targetInfo)

        // Verify blob in target
        const blob = await targetStorage.openBlob(CONTEXTx1, "blobkey")
        const reader = blob.stream().getReader()
        const { value } = await reader.read()
        assert.deepEqual(value, blobData)
      })

      it("migrate nested contexts", async () => {
        await sourceStorage.set(CONTEXTx1, "root", "rootValue")
        await sourceStorage.set(CONTEXTx2, "sub", "subValue")
        await sourceStorage.set(CONTEXTx3, "deep", "deepValue")

        // Setup target storage
        targetStorage = await StorageFactory.create(targetInfo)

        // Verify contexts exist in target
        expect(await targetStorage.contexts([])).deep.members(CONTEXTx1)
        expect(await targetStorage.contexts(CONTEXTx1)).deep.equal(["subcontext"])
        expect(await targetStorage.contexts(CONTEXTx2)).deep.equal(["subsubcontext"])
      })

      // Close source storage
      after(async () => {
        await sourceStorage?.close()
        await StorageFactory.remove(sourceInfo)
      })
    })
  }

  // Cleanup
  after(async () => {
    await rm(TEST_STORAGE_LOCATION, { recursive: true, force: true })
  })
})