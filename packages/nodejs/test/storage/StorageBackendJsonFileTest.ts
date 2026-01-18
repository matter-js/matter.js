/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#general";
import { StorageBackendJsonFile } from "#storage/index.js";
import * as assert from "node:assert";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const TEST_STORAGE_LOCATION = resolve(tmpdir(), "matterjs-test-storage.json");

describe("Storage in JSON File", () => {
    beforeEach(async () => {
        try {
            await unlink(TEST_STORAGE_LOCATION);
        } catch {
            // Ignore
        }
    });

    it("write and read success", async () => {
        const storage = new StorageBackendJsonFile(TEST_STORAGE_LOCATION);
        storage.initialize();

        storage.set(["context"], "key", "value");

        const value = storage.get(["context"], "key");
        assert.equal(value, "value");

        await MockTime.advance(2 * 1000);

        await storage.committed;

        const storageRead = new StorageBackendJsonFile(TEST_STORAGE_LOCATION);
        storageRead.initialize();

        const valueRead = storage.get(["context"], "key");
        assert.equal(valueRead, "value");

        const fileContent = await readFile(TEST_STORAGE_LOCATION);
        assert.equal(
            fileContent.toString(),
            `{
 "context": {
  "key": "value"
 }
}`,
        );

        await storageRead.close();
        await storage.close();
    });

    it("write and delete success", async () => {
        const storage = await StorageBackendJsonFile.create(TEST_STORAGE_LOCATION);

        storage.set(["context"], "key", "value");

        const value = storage.get(["context"], "key");
        assert.equal(value, "value");

        storage.delete(["context"], "key");
        assert.equal(storage.get(["context"], "key"), undefined);

        await MockTime.advance(2 * 1000);

        await storage.committed;

        const storageRead = await StorageBackendJsonFile.create(TEST_STORAGE_LOCATION);

        const valueRead = storage.get(["context"], "key");
        assert.equal(valueRead, undefined);

        const fileContent = await readFile(TEST_STORAGE_LOCATION);
        assert.equal(
            fileContent.toString(),
            `{
 "context": {}
}`,
        );

        await storageRead.close();
        await storage.close();
    });

    it("Throws error when context is empty on set", async () => {
        const storage = await StorageBackendJsonFile.create(TEST_STORAGE_LOCATION);
        assert.throws(
            () => {
                storage.set([""], "key", "value");
            },
            {
                message: "Context must not be an empty string.",
            },
        );
    });

    it("Throws error when key is empty on set", async () => {
        const storage = await StorageBackendJsonFile.create(TEST_STORAGE_LOCATION);
        assert.throws(
            () => {
                storage.set(["context"], "", "value");
            },
            {
                message: "Context and key must not be empty.",
            },
        );
    });

    it("Throws error when context is empty on get", async () => {
        const storage = await StorageBackendJsonFile.create(TEST_STORAGE_LOCATION);
        assert.throws(
            () => {
                storage.get([""], "key");
            },
            {
                message: "Context must not be an empty string.",
            },
        );
    });

    it("Throws error when key is empty on get", async () => {
        const storage = await StorageBackendJsonFile.create(TEST_STORAGE_LOCATION);
        assert.throws(
            () => {
                storage.get(["context"], "");
            },
            {
                message: "Context and key must not be empty.",
            },
        );
    });

    it("writeBlob and readBlob success", async () => {
        const storage = await StorageBackendJsonFile.create(TEST_STORAGE_LOCATION);
        const data = new Uint8Array([21, 22, 23]);
        const stream = new ReadableStream<Bytes>({
            start(controller) {
                controller.enqueue(data);
                controller.close();
            },
        });

        await storage.writeBlobFromStream(["context"], "blobkey", stream);

        const blob = storage.openBlob(["context"], "blobkey");
        const reader = blob.stream().getReader();
        const chunks: Bytes[] = [];
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        assert.deepEqual(chunks[0], data);
    });

    it("blobSize returns correct size", async () => {
        const storage = await StorageBackendJsonFile.create(TEST_STORAGE_LOCATION);
        const data = new Uint8Array([31, 32]);
        storage.set(["context"], "blobkey", data);

        const blob = storage.openBlob(["context"], "blobkey");
        assert.equal(blob.size, 2);
    });

    it("readBlob returns empty stream for missing key", async () => {
        const storage = await StorageBackendJsonFile.create(TEST_STORAGE_LOCATION);
        const blob = storage.openBlob(["context"], "missingkey");
        const reader = blob.stream().getReader();
        const { done } = await reader.read();
        assert.equal(done, true);
    });

    after(async () => {
        try {
            await unlink(TEST_STORAGE_LOCATION);
        } catch {
            // Ignore
        }
    });
});
