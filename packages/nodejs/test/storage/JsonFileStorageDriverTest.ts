/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { JsonFileStorageDriver } from "#storage/index.js";

import * as assert from "node:assert";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const TEST_STORAGE_LOCATION = resolve(tmpdir(), "matterjs-test-storage.json");

async function createJsonFileStorage(path: string) {
    // Tests use a string path directly (not DataNamespace), so we construct + initialize manually
    const storage = new JsonFileStorageDriver(path);
    await storage.initialize();
    return storage;
}

describe("Storage in JSON File", () => {
    beforeEach(async () => {
        try {
            await unlink(TEST_STORAGE_LOCATION);
        } catch {
            // Ignore
        }
    });

    it("write and read success", async () => {
        const storage = await createJsonFileStorage(TEST_STORAGE_LOCATION);

        storage.set(["context"], "key", "value");

        const value = storage.get(["context"], "key");
        assert.equal(value, "value");

        await MockTime.advance(2 * 1000);

        await storage.committed;

        const storageRead = await createJsonFileStorage(TEST_STORAGE_LOCATION);

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
        const storage = await createJsonFileStorage(TEST_STORAGE_LOCATION);

        storage.set(["context"], "key", "value");

        const value = storage.get(["context"], "key");
        assert.equal(value, "value");

        storage.delete(["context"], "key");
        assert.equal(storage.get(["context"], "key"), undefined);

        await MockTime.advance(2 * 1000);

        await storage.committed;

        const storageRead = await createJsonFileStorage(TEST_STORAGE_LOCATION);

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

    it("Allows root-level keys with empty context", async () => {
        const storage = await createJsonFileStorage(TEST_STORAGE_LOCATION);
        storage.set([], "key", "value");
        assert.equal(storage.get([], "key"), "value");
        assert.deepEqual(storage.keys([]), ["key"]);
        storage.delete([], "key");
        assert.deepEqual(storage.keys([]), []);
    });

    it("Throws error when context segment is empty on set", async () => {
        const storage = await createJsonFileStorage(TEST_STORAGE_LOCATION);
        assert.throws(
            () => {
                storage.set([""], "key", "value");
            },
            {
                message: "Context must not contain empty segments or leading or trailing dots.",
            },
        );
    });

    it("Throws error when key is empty on set", async () => {
        const storage = await createJsonFileStorage(TEST_STORAGE_LOCATION);
        assert.throws(
            () => {
                storage.set(["context"], "", "value");
            },
            {
                message: "Key must not be empty.",
            },
        );
    });

    it("Throws error when context segment is empty on get", async () => {
        const storage = await createJsonFileStorage(TEST_STORAGE_LOCATION);
        assert.throws(
            () => {
                storage.get([""], "key");
            },
            {
                message: "Context must not contain empty segments or leading or trailing dots.",
            },
        );
    });

    it("Throws error when key is empty on get", async () => {
        const storage = await createJsonFileStorage(TEST_STORAGE_LOCATION);
        assert.throws(
            () => {
                storage.get(["context"], "");
            },
            {
                message: "Key must not be empty.",
            },
        );
    });

    after(async () => {
        try {
            await unlink(TEST_STORAGE_LOCATION);
        } catch {
            // Ignore
        }
    });
});
