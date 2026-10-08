/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { JsonFileStorageDriver } from "#storage/index.js";

import * as assert from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

// The driver commits on a real timer, so a driver left open writes into whichever test runs when it fires
const openStorages = new Array<JsonFileStorageDriver>();

async function createJsonFileStorage(path: string) {
    // Tests use a string path directly (not DataNamespace), so we construct + initialize manually
    const storage = new JsonFileStorageDriver(path);
    openStorages.push(storage);
    await storage.initialize();
    return storage;
}

describe("Storage in JSON File", () => {
    let testDir: string;
    let storagePath: string;

    beforeEach(async () => {
        testDir = await mkdtemp(resolve(tmpdir(), "matterjs-test-storage-"));
        storagePath = resolve(testDir, "storage.json");
    });

    afterEach(async () => {
        try {
            for (const storage of openStorages.splice(0)) {
                await storage.close();
            }
        } finally {
            await rm(testDir, { recursive: true, force: true });
        }
    });

    it("write and read success", async () => {
        const storage = await createJsonFileStorage(storagePath);

        storage.set(["context"], "key", "value");

        const value = storage.get(["context"], "key");
        assert.equal(value, "value");

        await storage.committed;

        const storageRead = await createJsonFileStorage(storagePath);

        const valueRead = storageRead.get(["context"], "key");
        assert.equal(valueRead, "value");

        const fileContent = await readFile(storagePath);
        assert.equal(
            fileContent.toString(),
            `{
 "context": {
  "key": "value"
 }
}`,
        );
    });

    it("write and delete success", async () => {
        const storage = await createJsonFileStorage(storagePath);

        storage.set(["context"], "key", "value");

        const value = storage.get(["context"], "key");
        assert.equal(value, "value");

        storage.delete(["context"], "key");
        assert.equal(storage.get(["context"], "key"), undefined);

        await storage.committed;

        const storageRead = await createJsonFileStorage(storagePath);

        const valueRead = storageRead.get(["context"], "key");
        assert.equal(valueRead, undefined);

        const fileContent = await readFile(storagePath);
        assert.equal(
            fileContent.toString(),
            `{
 "context": {}
}`,
        );
    });

    it("Allows root-level keys with empty context", async () => {
        const storage = await createJsonFileStorage(storagePath);
        storage.set([], "key", "value");
        assert.equal(storage.get([], "key"), "value");
        assert.deepEqual(storage.keys([]), ["key"]);
        storage.delete([], "key");
        assert.deepEqual(storage.keys([]), []);
    });

    it("Throws error when context segment is empty on set", async () => {
        const storage = await createJsonFileStorage(storagePath);
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
        const storage = await createJsonFileStorage(storagePath);
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
        const storage = await createJsonFileStorage(storagePath);
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
        const storage = await createJsonFileStorage(storagePath);
        assert.throws(
            () => {
                storage.get(["context"], "");
            },
            {
                message: "Key must not be empty.",
            },
        );
    });
});
