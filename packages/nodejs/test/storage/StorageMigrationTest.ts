/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeJsFilesystem } from "#fs/NodeJsFilesystem.js";
import { StorageBackendDisk } from "#storage/fs/StorageBackendDisk.js";
import { PlatformSqlite } from "#storage/sqlite/index.js";
import { supportsSqlite } from "#util/runtimeChecks.js";
import { Bytes, Environment, Filesystem, StorageDriver, StorageMigration, StorageService } from "@matter/general";
import * as assert from "node:assert";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
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

describe("StorageService migration", () => {
    let rootDir: string;
    let env: Environment;
    let storageService: StorageService;

    before(async () => {
        rootDir = await mkdtemp(resolve(tmpdir(), "matterjs-svc-migration-"));
        const fs = new NodeJsFilesystem(rootDir);
        env = new Environment("test-migration");
        env.set(Filesystem, fs);
        storageService = env.get(StorageService);

        // Register the "file" driver
        storageService.registerDriver(StorageBackendDisk);

        // Register a "mock" driver that wraps StorageBackendDisk under a different id
        storageService.registerDriver({
            id: "mock",
            create(dir) {
                return StorageBackendDisk.create(dir);
            },
        });

        // Register a "failing" driver whose create throws
        storageService.registerDriver({
            id: "failing",
            create() {
                throw new Error("Intentional driver failure");
            },
        });
    });

    after(async () => {
        await rm(rootDir, { recursive: true, force: true });
    });

    const NAMESPACE = "test-svc-ns";

    afterEach(async () => {
        storageService.configuredDriver = undefined;
        await rm(resolve(rootDir, NAMESPACE), { recursive: true, force: true }).catch(() => {});
        await rm(resolve(rootDir, ".migrations"), { recursive: true, force: true }).catch(() => {});
    });

    async function populateSource() {
        const nsDir = resolve(rootDir, NAMESPACE);
        await mkdir(nsDir, { recursive: true });

        const storage = new StorageBackendDisk(nsDir);
        await storage.initialize();
        await storage.set(["context"], "key1", "value1");
        await storage.set(["context", "sub"], "key2", "value2");
        await storage.close();

        // Write driver.json marking this as "file" driver
        const fs = env.get(Filesystem);
        const dir = fs.directory(NAMESPACE);
        await dir.file("driver.json").write(JSON.stringify({ kind: "file" }));
    }

    it("migrates correctly", async () => {
        await populateSource();

        storageService.configuredDriver = "mock";

        const manager = await storageService.open(NAMESPACE);

        // Verify migrated data is readable
        const ctx = manager.createContext("context");
        assert.equal(await ctx.get("key1"), "value1");
        const subCtx = ctx.createContext("sub");
        assert.equal(await subCtx.get("key2"), "value2");

        await manager.close();

        // Check .migrations/ has a backup
        const migrationsDir = resolve(rootDir, ".migrations");
        const entries = await readdir(migrationsDir);
        const backups = entries.filter(e => e.startsWith(`${NAMESPACE}-old-file-`));
        assert.ok(backups.length > 0, "Expected at least one backup directory");

        // Temp dir should not exist (cleaned up by swap)
        const tempExists = entries.includes(`${NAMESPACE}-new`);
        assert.equal(tempExists, false, "Temp dir should not exist after successful migration");

        // driver.json in the namespace dir should say "mock"
        const fs = env.get(Filesystem);
        const driverJson = await fs.directory(NAMESPACE).file("driver.json").readAllText();
        const descriptor = JSON.parse(driverJson);
        assert.equal(descriptor.kind, "mock");
    });

    it("cleans up and preserves source on migration failure", async () => {
        await populateSource();

        storageService.configuredDriver = "failing";

        await assert.rejects(storageService.open(NAMESPACE), /Intentional driver failure/);

        // Source directory should still exist with original data
        const fs = env.get(Filesystem);
        const dir = fs.directory(NAMESPACE);
        assert.ok(await dir.exists(), "Source directory should still exist");

        // Verify original data is intact by opening with "file" driver
        const storage = new StorageBackendDisk(resolve(rootDir, NAMESPACE));
        await storage.initialize();
        assert.equal(await storage.get(["context"], "key1"), "value1");
        await storage.close();

        // .migrations/ temp dir should not exist (cleaned up on failure)
        const migrationsDir = resolve(rootDir, ".migrations");
        try {
            const entries = await readdir(migrationsDir);
            const tempExists = entries.includes(`${NAMESPACE}-new`);
            assert.equal(tempExists, false, "Temp dir should be cleaned up on failure");

            // No backup dirs should exist (swap never happened)
            const backups = entries.filter(e => e.startsWith(`${NAMESPACE}-old-`));
            assert.equal(backups.length, 0, "No backups should exist when migration fails");
        } catch (e) {
            // .migrations/ may not exist at all, which is fine
            if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
                throw e;
            }
        }
    });
});
