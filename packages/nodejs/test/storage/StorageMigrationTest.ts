/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StorageBackendDisk } from "#storage/fs/StorageBackendDisk.js";
import { PlatformSqlite } from "#storage/sqlite/index.js";
import { supportsSqlite } from "#util/runtimeChecks.js";
import { Bytes, StorageDriver, StorageMigration } from "@matter/general";
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

const driverFactories: DriverFactory[] = [
    {
        name: "file",
        async create(namespace) {
            const path = resolve(TEST_STORAGE_LOCATION, namespace);
            const storage = new StorageBackendDisk(path);
            await storage.initialize();
            return storage;
        },
        async remove(namespace) {
            await rm(resolve(TEST_STORAGE_LOCATION, namespace), { recursive: true, force: true });
        },
    },
];

if (supportsSqlite()) {
    driverFactories.push({
        name: "sqlite",
        async create(namespace) {
            const path = resolve(TEST_STORAGE_LOCATION, `${namespace}.db`);
            const storage = await PlatformSqlite(path, false);
            await storage.initialize();
            return storage;
        },
        async remove(namespace) {
            await rm(resolve(TEST_STORAGE_LOCATION, `${namespace}.db`), { recursive: true, force: true });
        },
    });
}

describe("StorageMigration", () => {
    const testPairs: { source: DriverFactory; target: DriverFactory }[] = [];

    if (supportsSqlite()) {
        const fileFactory = driverFactories.find(d => d.name === "file")!;
        const sqliteFactory = driverFactories.find(d => d.name === "sqlite")!;
        testPairs.push({ source: fileFactory, target: sqliteFactory }, { source: sqliteFactory, target: fileFactory });
    } else {
        it.skip("requires SQLite support (Node.js v22+)", () => {
            // This test is informative blank test.
        });
    }

    before(async () => {
        await mkdir(TEST_STORAGE_LOCATION, { recursive: true });
    });

    for (const pair of testPairs) {
        describe(`${pair.source.name} to ${pair.target.name}`, () => {
            const { source, target } = pair;
            const namespace = `test_${source.name}to${target.name}`;

            let sourceStorage: StorageDriver;
            let targetStorage: StorageDriver | null = null;

            beforeEach(async () => {
                if (sourceStorage != null) {
                    await sourceStorage.close();
                    await source.remove(namespace);
                }
                sourceStorage = await source.create(namespace);
            });

            afterEach(async () => {
                await targetStorage?.close();
                targetStorage = null;
                await target.remove(namespace);
            });

            it("migrate check of context-key with json value", async () => {
                // Setup source storage
                await sourceStorage.set(CONTEXTx1, "key1", "value1");
                await sourceStorage.set(CONTEXTx2, "key2", "value2");
                await sourceStorage.set(CONTEXTx3, { key3: "value3", key4: 42 });

                // Create target and migrate
                targetStorage = await target.create(namespace);
                await StorageMigration.migrate(sourceStorage, targetStorage);

                // Verify data in target
                assert.equal(await targetStorage.get(CONTEXTx1, "key1"), "value1");
                assert.equal(await targetStorage.get(CONTEXTx2, "key2"), "value2");
                assert.equal(await targetStorage.get(CONTEXTx3, "key3"), "value3");
                assert.equal(await targetStorage.get(CONTEXTx3, "key4"), 42);
            });

            it("migrate check of context-key with blob", async () => {
                // Setup source storage
                const blobData = new Uint8Array([1, 2, 3, 4, 5]);
                const stream = new ReadableStream<Bytes>({
                    start(controller) {
                        controller.enqueue(blobData);
                        controller.close();
                    },
                });
                await sourceStorage.writeBlobFromStream(CONTEXTx1, "blobkey", stream);

                // Create target and migrate
                targetStorage = await target.create(namespace);
                await StorageMigration.migrate(sourceStorage, targetStorage);

                // Verify blob in target
                const blob = await targetStorage.openBlob(CONTEXTx1, "blobkey");
                const reader = blob.stream().getReader();
                const { value } = await reader.read();
                assert.deepEqual(value, blobData);
            });

            it("migrate nested contexts", async () => {
                await sourceStorage.set(CONTEXTx1, "root", "rootValue");
                await sourceStorage.set(CONTEXTx2, "sub", "subValue");
                await sourceStorage.set(CONTEXTx3, "deep", "deepValue");

                // Create target and migrate
                targetStorage = await target.create(namespace);
                await StorageMigration.migrate(sourceStorage, targetStorage);

                // Verify contexts exist in target
                expect(await targetStorage.contexts([])).deep.members(CONTEXTx1);
                expect(await targetStorage.contexts(CONTEXTx1)).deep.equal(["subcontext"]);
                expect(await targetStorage.contexts(CONTEXTx2)).deep.equal(["subsubcontext"]);
            });

            // Close source storage
            after(async () => {
                await sourceStorage?.close();
                await source.remove(namespace);
            });
        });
    }

    // Cleanup
    after(async () => {
        await rm(TEST_STORAGE_LOCATION, { recursive: true, force: true });
    });
});
