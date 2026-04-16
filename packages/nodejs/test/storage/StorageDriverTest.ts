/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FileStorageDriver } from "#storage/fs/FileStorageDriver.js";
import { SqliteStorageDriver } from "#storage/sqlite/SqliteStorageDriver.js";
import { SqliteStorageDriverError } from "#storage/sqlite/SqliteStorageDriverError.js";
import { supportsSqlite } from "#util/runtimeChecks.js";
import { StorageDriver, StorageError } from "@matter/general";
import * as assert from "node:assert";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const TEST_STORAGE_LOCATION = resolve(tmpdir(), "matterjs-test-storage");

const CONTEXTx1 = ["context"];
const CONTEXTx2 = [...CONTEXTx1, "subcontext"];
const CONTEXTx3 = [...CONTEXTx2, "subsubcontext"];

interface DriverFactory {
    name: string;
    create(namespace: string): Promise<StorageDriver>;
    remove(namespace: string): Promise<void>;
}

const drivers: DriverFactory[] = [
    {
        name: "file",
        async create(namespace) {
            const path = resolve(TEST_STORAGE_LOCATION, namespace);
            const storage = new FileStorageDriver(path);
            await storage.initialize();
            return storage;
        },
        async remove(namespace) {
            await rm(resolve(TEST_STORAGE_LOCATION, namespace), { recursive: true, force: true });
        },
    },
];

if (supportsSqlite()) {
    drivers.push({
        name: "sqlite",
        async create(namespace) {
            const path = resolve(TEST_STORAGE_LOCATION, `${namespace}.db`);
            const storage = new SqliteStorageDriver({ namespaceOrPath: path });
            await storage.initialize();
            return storage;
        },
        async remove(namespace) {
            await rm(resolve(TEST_STORAGE_LOCATION, `${namespace}.db`), { recursive: true, force: true });
        },
    });
}

describe("StorageDrivers", () => {
    before(async () => {
        await mkdir(TEST_STORAGE_LOCATION, { recursive: true });
    });

    for (const driver of drivers) {
        describe(`${driver.name} driver`, () => {
            const namespace = `test_${driver.name}`;

            let storage: StorageDriver;

            beforeEach(async () => {
                storage = await driver.create(namespace);
            });
            afterEach(async () => {
                await storage?.close();
                await driver.remove(namespace);
            });

            it("write and read success", async () => {
                await storage.set(CONTEXTx1, "key", "value");

                const value = await storage.get(CONTEXTx1, "key");
                assert.equal(value, "value");
            });

            it("multi-write and read success", async () => {
                await storage.set(CONTEXTx1, { key: "value", key2: "value2" });

                const value = await storage.get(CONTEXTx1, "key");
                assert.equal(value, "value");
                const value2 = await storage.get(CONTEXTx1, "key2");
                assert.equal(value2, "value2");
            });

            it("multi-write and values read success", async () => {
                await storage.set(CONTEXTx1, { key: "value", key2: "value2" });

                const values = await storage.values(CONTEXTx1);
                assert.deepEqual(values, { key: "value", key2: "value2" });
            });

            it("write and delete success", async () => {
                await storage.set(CONTEXTx1, "key", "value");
                await storage.delete(CONTEXTx1, "key");

                const value = await storage.get(CONTEXTx1, "key");
                assert.equal(value, undefined);
            });

            it("write and clearAll success", async () => {
                await storage.set(CONTEXTx1, "key", "value");
                await storage.clearAll(CONTEXTx1);

                const value = await storage.get(CONTEXTx1, "key");
                assert.equal(value, undefined);
            });

            it("write and read success with multiple context levels", async () => {
                await storage.set(CONTEXTx3, "key", "value");

                const value = await storage.get(CONTEXTx3, "key");
                assert.equal(value, "value");
            });

            it("write and read success with multiple context levels and special chars", async () => {
                const location = [...CONTEXTx3, "it'a/slash"];
                await storage.set(location, "key", "value");

                const value = await storage.get(location, "key");
                assert.equal(value, "value");
            });

            it("return keys with storage values", async () => {
                await storage.set(CONTEXTx3, "key", "value");

                const value = await storage.keys(CONTEXTx3);
                expect(value).deep.equal(["key"]);
            });

            it("return keys with storage values and special chars", async () => {
                const location = [...CONTEXTx3, "it'a/slash"];
                await storage.set(location, "key", "value");

                const value = await storage.keys(location);
                expect(value).deep.equal(["key"]);
            });

            it("return keys with storage without subcontexts values", async () => {
                await storage.set(CONTEXTx2, "key", "value");
                await storage.set(CONTEXTx3, "key", "value");

                const value = await storage.keys(CONTEXTx2);
                expect(value).deep.equal(["key"]);
            });

            it("return contexts with subcontexts", async () => {
                await storage.set(CONTEXTx2, "key", "value");
                await storage.set(["context", "subcontext2"], "key", "value");
                await storage.set(CONTEXTx3, "key", "value");

                // contexts function returns `Set` so
                // ordering shouldn't be important.
                expect(await storage.contexts(CONTEXTx3)).deep.equal([]);
                expect(await storage.contexts(CONTEXTx2)).deep.equal(["subsubcontext"]);
                expect(await storage.contexts(CONTEXTx1)).deep.members(["subcontext", "subcontext2"]);
                expect(await storage.contexts([])).deep.members(CONTEXTx1);
            });

            it("return contexts with subcontexts with special chars", async () => {
                await storage.set(CONTEXTx2, "key", "value");
                await storage.set(["context", "sub's/fun"], "key", "value");
                await storage.set(CONTEXTx3, "key", "value");

                expect(await storage.contexts(CONTEXTx3)).deep.equal([]);
                expect(await storage.contexts(CONTEXTx2)).deep.equal(["subsubcontext"]);
                expect(await storage.contexts(CONTEXTx1)).deep.members(["sub's/fun", "subcontext"]);
                expect(await storage.contexts([])).deep.members(CONTEXTx1);
            });

            it("clear all keys with multiple contextes", async () => {
                await storage.set(CONTEXTx1, "key1", "value");
                await storage.set(CONTEXTx2, "key2", "value");
                await storage.set(CONTEXTx3, "key3", "value");

                await storage.clearAll(CONTEXTx2);
                expect(await storage.keys(CONTEXTx1)).deep.equal(["key1"]);
                expect(await storage.keys(CONTEXTx2)).deep.equal([]);
                expect(await storage.keys(CONTEXTx3)).deep.equal([]);
            });

            it("Allows root-level keys with empty context", async () => {
                await storage.set([], "key", "value");
                assert.equal(await storage.get([], "key"), "value");
                assert.deepEqual(await storage.keys([]), ["key"]);
                await storage.delete([], "key");
                assert.deepEqual(await storage.keys([]), []);
            });

            it("root-level keys coexist with context keys", async () => {
                await storage.set([], "rootKey", "rootValue");
                await storage.set([], { rootA: "a", rootB: "b" });
                await storage.set(CONTEXTx1, "ctxKey", "ctxValue");
                await storage.set(CONTEXTx2, "subKey", "subValue");

                // Root-level keys are isolated
                expect(await storage.keys([])).deep.members(["rootKey", "rootA", "rootB"]);
                assert.equal(await storage.get([], "rootKey"), "rootValue");
                assert.equal(await storage.get([], "rootA"), "a");
                assert.equal(await storage.get([], "rootB"), "b");

                // Context keys are unaffected
                expect(await storage.keys(CONTEXTx1)).deep.equal(["ctxKey"]);
                assert.equal(await storage.get(CONTEXTx1, "ctxKey"), "ctxValue");

                // contexts([]) still returns top-level contexts
                expect(await storage.contexts([])).deep.members(["context"]);

                // Delete root key doesn't affect context keys
                await storage.delete([], "rootKey");
                expect(await storage.keys([])).deep.members(["rootA", "rootB"]);
                expect(await storage.keys(CONTEXTx1)).deep.equal(["ctxKey"]);
            });

            it("Rejects with error when context segment is empty on set", async () => {
                await assert.rejects(
                    async () => {
                        await storage.set([""], "key", "value");
                    },
                    (error: StorageError) => {
                        const message = error instanceof SqliteStorageDriverError ? error.mainReason : error.message;
                        assert.equal(message, "Context must not contain empty segments or leading or trailing dots.");
                        return true;
                    },
                );
            });

            it("Rejects with error when key is empty on set", async () => {
                await assert.rejects(
                    async () => {
                        await storage.set(CONTEXTx1, "", "value");
                    },
                    (error: StorageError) => {
                        const message = error instanceof SqliteStorageDriverError ? error.mainReason : error.message;
                        assert.equal(message, "Key must not be an empty string.");
                        return true;
                    },
                );
            });

            it("Rejects with error when context segment is empty on get", async () => {
                await assert.rejects(
                    async () => {
                        await storage.get([""], "key");
                    },
                    (error: StorageError) => {
                        const message = error instanceof SqliteStorageDriverError ? error.mainReason : error.message;
                        assert.equal(message, "Context must not contain empty segments or leading or trailing dots.");
                        return true;
                    },
                );
            });

            it("Rejects with error when context segment is empty on get with subcontext", async () => {
                await assert.rejects(
                    async () => {
                        await storage.get(["ok", ""], "key");
                    },
                    (error: StorageError) => {
                        const message = error instanceof SqliteStorageDriverError ? error.mainReason : error.message;
                        assert.equal(message, "Context must not contain empty segments or leading or trailing dots.");
                        return true;
                    },
                );
            });

            it("Rejects with error when key is empty on get", async () => {
                await assert.rejects(
                    async () => {
                        await storage.get(CONTEXTx1, "");
                    },
                    (error: StorageError) => {
                        const message = error instanceof SqliteStorageDriverError ? error.mainReason : error.message;
                        assert.equal(message, "Key must not be an empty string.");
                        return true;
                    },
                );
            });
        });
    }

    // Cleanup
    after(async () => {
        await rm(TEST_STORAGE_LOCATION, { recursive: true, force: true });
    });
});
