/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Storage, StorageError } from "@matter/general"
import { SqliteStorageError, StorageFactory, StorageType } from "#storage/index.js"
import * as assert from "node:assert"
import { mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"

const TEST_STORAGE_LOCATION = resolve(tmpdir(), "matterjs-test-storage")


const CONTEXTx1 = ["context"]
const CONTEXTx2 = [...CONTEXTx1, "subcontext"]
const CONTEXTx3 = [...CONTEXTx2, "subsubcontext"]

describe("StorageDrivers", () => {

  const drivers = [
    StorageType.FILE,
    StorageType.SQLITE,
  ]

  before(async () => {
    await mkdir(TEST_STORAGE_LOCATION, { recursive: true })
  })

  for (const driver of drivers) {
    describe(`${driver} driver`, () => {
      const driverInfo = {
        driver,
        rootDir: TEST_STORAGE_LOCATION,
        namespace: `test_${driver}`,
      }

      let storage: Storage

      beforeEach(async () => {
        storage = await StorageFactory.create({
          driver,
          rootDir: TEST_STORAGE_LOCATION,
          namespace: `test_${driver}`,
        })
      })
      afterEach(async () => {
        await storage?.close()
        await StorageFactory.remove(driverInfo)
      })

      it("write and read success", async () => {
        await storage.set(CONTEXTx1, "key", "value")

        const value = await storage.get(CONTEXTx1, "key")
        assert.equal(value, "value")
      })

      it("multi-write and read success", async () => {
        await storage.set(CONTEXTx1, { key: "value", key2: "value2" })

        const value = await storage.get(CONTEXTx1, "key")
        assert.equal(value, "value")
        const value2 = await storage.get(CONTEXTx1, "key2")
        assert.equal(value2, "value2")
      })

      it("multi-write and values read success", async () => {
        await storage.set(CONTEXTx1, { key: "value", key2: "value2" })

        const values = await storage.values(CONTEXTx1)
        assert.deepEqual(values, { key: "value", key2: "value2" })
      })

      it("write and delete success", async () => {
        await storage.set(CONTEXTx1, "key", "value")
        await storage.delete(CONTEXTx1, "key")

        const value = await storage.get(CONTEXTx1, "key")
        assert.equal(value, undefined)
      })

      it("write and clear success", async () => {
        await storage.set(CONTEXTx1, "key", "value")
        await storage.clear()

        const value = await storage.get(CONTEXTx1, "key")
        assert.equal(value, undefined)
      })

      it("write and read success with multiple context levels", async () => {
        await storage.set(CONTEXTx3, "key", "value")

        const value = await storage.get(CONTEXTx3, "key")
        assert.equal(value, "value")
      })

      it("write and read success with multiple context levels and special chars", async () => {
        const location = [...CONTEXTx3, "it'a/slash"]
        await storage.set(location, "key", "value")

        const value = await storage.get(location, "key")
        assert.equal(value, "value")
      })

      it("return keys with storage values", async () => {
        await storage.set(CONTEXTx3, "key", "value")

        const value = await storage.keys(CONTEXTx3)
        expect(value).deep.equal(["key"])
      })

      it("return keys with storage values and special chars", async () => {
        const location = [...CONTEXTx3, "it'a/slash"]
        await storage.set(location, "key", "value")

        const value = await storage.keys(location)
        expect(value).deep.equal(["key"])
      })

      it("return keys with storage without subcontexts values", async () => {
        await storage.set(CONTEXTx2, "key", "value")
        await storage.set(CONTEXTx3, "key", "value")

        const value = await storage.keys(CONTEXTx2)
        expect(value).deep.equal(["key"])
      })

      it("return contexts with subcontexts", async () => {
        await storage.set(CONTEXTx2, "key", "value")
        await storage.set(["context", "subcontext2"], "key", "value")
        await storage.set(CONTEXTx3, "key", "value")

        // contexts function returns `Set` so
        // ordering shouldn't be important.
        expect(await storage.contexts(CONTEXTx3)).deep.equal([])
        expect(await storage.contexts(CONTEXTx2)).deep.equal(["subsubcontext"])
        expect(await storage.contexts(CONTEXTx1)).deep.members(["subcontext", "subcontext2"])
        expect(await storage.contexts([])).deep.members(CONTEXTx1)
      })

      it("return contexts with subcontexts with special chars", async () => {
        await storage.set(CONTEXTx2, "key", "value")
        await storage.set(["context", "sub's/fun"], "key", "value")
        await storage.set(CONTEXTx3, "key", "value")

        // const storageRead = new StorageBackendDisk(TEST_STORAGE_LOCATION)
        // await storageRead.initialize()

        expect(await storage.contexts(CONTEXTx3)).deep.equal([])
        expect(await storage.contexts(CONTEXTx2)).deep.equal(["subsubcontext"])
        expect(await storage.contexts(CONTEXTx1)).deep.members(["sub's/fun", "subcontext"])
        expect(await storage.contexts([])).deep.members(CONTEXTx1)
      })

      it("clear all keys with multiple contextes", async () => {
        await storage.set(CONTEXTx1, "key1", "value")
        await storage.set(CONTEXTx2, "key2", "value")
        await storage.set(CONTEXTx3, "key3", "value")

        await storage.clearAll(CONTEXTx2)
        expect(await storage.keys(CONTEXTx1)).deep.equal(["key1"])
        expect(await storage.keys(CONTEXTx2)).deep.equal([])
        expect(await storage.keys(CONTEXTx3)).deep.equal([])
      })

      it("Rejects with error when context is empty on set", async () => {
        await assert.rejects(
          async () => {
            await storage.set([""], "key", "value")
          },
          (error: StorageError) => {
            const message = (error instanceof SqliteStorageError) ? error.mainReason : error.message
            assert.equal(message, "Context must not be an empty and not contain dots.")
            return true
          },
        )
      })

      it("Rejects with error when key is empty on set", async () => {
        await assert.rejects(
          async () => {
            await storage.set(CONTEXTx1, "", "value")
          },
          (error: StorageError) => {
            const message = (error instanceof SqliteStorageError) ? error.mainReason : error.message
            assert.equal(message, "Key must not be an empty string.")
            return true
          },
        )
      })

      it("Rejects with error when context is empty on get", async () => {
        await assert.rejects(
          async () => {
            await storage.get([""], "key")
          },
          (error: StorageError) => {
            const message = (error instanceof SqliteStorageError) ? error.mainReason : error.message
            assert.equal(message, "Context must not be an empty and not contain dots.")
            return true
          },
        )
      })

      it("Rejects with error when context is empty on get with subcontext", async () => {
        await assert.rejects(
          async () => {
            await storage.get(["ok", ""], "key")
          },
          (error: StorageError) => {
            const message = (error instanceof SqliteStorageError) ? error.mainReason : error.message
            assert.equal(message, "Context must not be an empty and not contain dots.")
            return true
          },
        )
      })

      it("Rejects with error when key is empty on get", async () => {
        await assert.rejects(
          async () => {
            await storage.get(CONTEXTx1, "")
          },
          (error: StorageError) => {
            const message = (error instanceof SqliteStorageError) ? error.mainReason : error.message
            assert.equal(message, "Key must not be an empty string.")
            return true
          },
        )
      })

      it("writeBlob and readBlob success", async () => {
        const data = new Uint8Array([5, 6, 7, 8])
        const stream = new ReadableStream<Bytes>({
          start(controller) {
            controller.enqueue(data)
            controller.close()
          },
        })

        await storage.writeBlobFromStream(CONTEXTx1, "blobkey", stream)

        const blob = await storage.openBlob(CONTEXTx1, "blobkey")
        const reader = blob.stream().getReader()
        const chunks: Bytes[] = []
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          chunks.push(value)
        }
        assert.deepEqual(chunks[0], data)
      })

      it("blobSize returns correct size", async () => {
        const data = new Uint8Array([9, 10, 11])
        const stream = new ReadableStream<Bytes>({
          start(controller) {
            controller.enqueue(data)
            controller.close()
          },
        })
        await storage.writeBlobFromStream(CONTEXTx2, "blobkey", stream)

        const blob = await storage.openBlob(CONTEXTx2, "blobkey")
        assert.equal(blob.size, 3)
      })

      it("readBlob returns empty stream for missing key", async () => {
        const blob = await storage.openBlob(CONTEXTx1, "missingkey")
        const reader = blob.stream().getReader()
        const { done } = await reader.read()
        assert.equal(done, true)
      })

    })
  }

  // Cleanup
  after(async () => {
    await rm(TEST_STORAGE_LOCATION, { recursive: true, force: true })
  })
})