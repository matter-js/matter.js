/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeJsFilesystem } from "#fs/NodeJsFilesystem.js";
import { DirectoryBlobStorageDriver } from "#storage/fs/DirectoryBlobStorageDriver.js";
import { FileStorageDriver } from "#storage/fs/FileStorageDriver.js";
import { FlatFileBlobStorageDriver } from "#storage/fs/FlatFileBlobStorageDriver.js";
import { WalBlobStorageDriver } from "#storage/fs/WalBlobStorageDriver.js";
import { SqliteStorageDriver } from "#storage/sqlite/SqliteStorageDriver.js";
import { supportsSqlite } from "#util/runtimeChecks.js";
import {
    BlobStorageDriver,
    Bytes,
    DatafileRoot,
    Environment,
    Filesystem,
    StorageDriver,
    StorageMigration,
    StorageService,
    WalStorageDriver,
} from "@matter/general";
import * as assert from "node:assert";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
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
            const storage = new FileStorageDriver(path);
            await storage.initialize();
            return storage;
        },
        async remove(namespace) {
            await rm(resolve(TEST_STORAGE_LOCATION, namespace), { recursive: true, force: true });
        },
    },
    {
        name: "wal",
        async create(namespace) {
            const path = resolve(TEST_STORAGE_LOCATION, namespace);
            await mkdir(path, { recursive: true });
            const fs = new NodeJsFilesystem(path);
            const storage = new WalStorageDriver(undefined, {
                storageDir: fs.directory("."),
                fsync: false,
            });
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
            const storage = new SqliteStorageDriver({ namespaceOrPath: path });
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

    // Build all migration pairs between different driver types
    for (const source of driverFactories) {
        for (const target of driverFactories) {
            if (source.name !== target.name) {
                testPairs.push({ source, target });
            }
        }
    }

    before(async () => {
        await mkdir(TEST_STORAGE_LOCATION, { recursive: true });
    });

    for (const pair of testPairs) {
        describe(`${pair.source.name} to ${pair.target.name}`, () => {
            const { source, target } = pair;
            const sourceNs = `test_${source.name}to${target.name}_src`;
            const targetNs = `test_${source.name}to${target.name}_tgt`;

            let sourceStorage: StorageDriver;
            let targetStorage: StorageDriver | null = null;

            beforeEach(async () => {
                if (sourceStorage != null) {
                    await sourceStorage.close();
                    await source.remove(sourceNs);
                }
                sourceStorage = await source.create(sourceNs);
            });

            afterEach(async () => {
                await targetStorage?.close();
                targetStorage = null;
                await target.remove(targetNs);
            });

            it("migrate check of context-key with json value", async () => {
                // Setup source storage
                await sourceStorage.set(CONTEXTx1, "key1", "value1");
                await sourceStorage.set(CONTEXTx2, "key2", "value2");
                await sourceStorage.set(CONTEXTx3, { key3: "value3", key4: 42 });

                // Create target and migrate
                targetStorage = await target.create(targetNs);
                await StorageMigration.migrate(sourceStorage, targetStorage);

                // Verify data in target
                assert.equal(await targetStorage.get(CONTEXTx1, "key1"), "value1");
                assert.equal(await targetStorage.get(CONTEXTx2, "key2"), "value2");
                assert.equal(await targetStorage.get(CONTEXTx3, "key3"), "value3");
                assert.equal(await targetStorage.get(CONTEXTx3, "key4"), 42);
            });

            it("migrate nested contexts", async () => {
                await sourceStorage.set(CONTEXTx1, "root", "rootValue");
                await sourceStorage.set(CONTEXTx2, "sub", "subValue");
                await sourceStorage.set(CONTEXTx3, "deep", "deepValue");

                // Create target and migrate
                targetStorage = await target.create(targetNs);
                await StorageMigration.migrate(sourceStorage, targetStorage);

                // Verify contexts exist in target
                expect(await targetStorage.contexts([])).deep.members(CONTEXTx1);
                expect(await targetStorage.contexts(CONTEXTx1)).deep.equal(["subcontext"]);
                expect(await targetStorage.contexts(CONTEXTx2)).deep.equal(["subsubcontext"]);
            });

            it("migrate root-level keys alongside context keys", async () => {
                // Write root-level and context-level data
                await sourceStorage.set([], "rootKey", "rootValue");
                await sourceStorage.set([], { rootA: "a", rootB: "b" });
                await sourceStorage.set(CONTEXTx1, "ctxKey", "ctxValue");
                await sourceStorage.set(CONTEXTx2, "subKey", "subValue");

                // Migrate
                targetStorage = await target.create(targetNs);
                await StorageMigration.migrate(sourceStorage, targetStorage);

                // Verify root-level keys migrated
                assert.equal(await targetStorage.get([], "rootKey"), "rootValue");
                assert.equal(await targetStorage.get([], "rootA"), "a");
                assert.equal(await targetStorage.get([], "rootB"), "b");
                expect(await targetStorage.keys([])).deep.members(["rootKey", "rootA", "rootB"]);

                // Verify context keys migrated
                assert.equal(await targetStorage.get(CONTEXTx1, "ctxKey"), "ctxValue");
                assert.equal(await targetStorage.get(CONTEXTx2, "subKey"), "subValue");

                // Verify contexts are intact
                expect(await targetStorage.contexts([])).deep.members(["context"]);
            });

            // Close source storage
            after(async () => {
                await sourceStorage?.close();
                await source.remove(sourceNs);
            });
        });
    }

    describe("cross-type: flat file KV → blob (legacy FileStorageDriver)", () => {
        const sourceNs = "test_flat_to_blob_src";
        const targetNs = "test_flat_to_blob_tgt";
        const blobData1 = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);
        const blobData2 = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02]);

        afterEach(async () => {
            await rm(resolve(TEST_STORAGE_LOCATION, sourceNs), { recursive: true, force: true });
            await rm(resolve(TEST_STORAGE_LOCATION, targetNs), { recursive: true, force: true });
        });

        it("migrates blobs from flat file format to directory structure", async () => {
            // Create a FileStorageDriver with KV data and blob data mixed together
            const sourcePath = resolve(TEST_STORAGE_LOCATION, sourceNs);
            const source = new FileStorageDriver(sourcePath);
            await source.initialize();

            // Write KV data
            await source.set(["bin", "fff1"], "metadata", "some-value");

            // Write blob data using the legacy (deprecated) method
            const stream1 = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(blobData1);
                    controller.close();
                },
            });
            await source.writeBlobFromStream(["bin", "fff1", "8000"], "prod", stream1);

            const stream2 = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(blobData2);
                    controller.close();
                },
            });
            await source.writeBlobFromStream(["bin", "fff1", "8000"], "test", stream2);

            // Create target blob storage
            const targetPath = resolve(TEST_STORAGE_LOCATION, targetNs);
            await mkdir(targetPath, { recursive: true });
            const targetFs = new NodeJsFilesystem(targetPath);
            const target = DirectoryBlobStorageDriver.create(new DatafileRoot(targetFs.directory(".")), {
                kind: "dir",
            });
            await target.initialize();

            // Cross-type migration: kv → blob
            const result = await StorageMigration.migrate(source, target);

            // The KV key should be skipped (counted as otherTypeKeysSkipped since it has a value, not a blob)
            assert.ok(result.otherTypeKeysSkipped > 0, "Should skip non-blob keys");
            assert.ok(result.migratedCount >= 2, "Should migrate at least 2 blob keys");

            // Verify blobs are readable from the new directory-based driver
            const blob1 = await target.openBlob(["bin", "fff1", "8000"], "prod");
            const blob1Data = new Uint8Array(await blob1.arrayBuffer());
            assert.deepStrictEqual(blob1Data, blobData1);

            const blob2 = await target.openBlob(["bin", "fff1", "8000"], "test");
            const blob2Data = new Uint8Array(await blob2.arrayBuffer());
            assert.deepStrictEqual(blob2Data, blobData2);

            await source.close();
            await target.close();
        });
    });

    describe("cross-type: WAL blobs/ directory → DirectoryBlobStorageDriver (compatibility)", () => {
        const ns = "test_wal_blob_compat";
        const blobData = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);

        afterEach(async () => {
            await rm(resolve(TEST_STORAGE_LOCATION, ns), { recursive: true, force: true });
        });

        it("reads WAL-format blobs directly with DirectoryBlobStorageDriver", async () => {
            // Simulate WAL's blobs/ directory structure manually:
            // blobs/<encoded-context1>/<encoded-context2>/<key>
            const blobsRoot = resolve(TEST_STORAGE_LOCATION, ns);
            const blobDir = resolve(blobsRoot, "bin", "fff1", "8000");
            await mkdir(blobDir, { recursive: true });
            await writeFile(resolve(blobDir, "prod"), blobData);
            await writeFile(resolve(blobDir, "test"), new Uint8Array([0xaa, 0xbb]));

            // Open with DirectoryBlobStorageDriver — should read the directory-format files
            const fs = new NodeJsFilesystem(blobsRoot);
            const driver = DirectoryBlobStorageDriver.create(new DatafileRoot(fs.directory(".")), { kind: "dir" });
            await driver.initialize();

            // Verify contexts are discovered
            const topContexts = await driver.contexts([]);
            assert.ok(topContexts.includes("bin"), `Expected "bin" in contexts, got ${topContexts}`);

            const subContexts = await driver.contexts(["bin", "fff1"]);
            assert.ok(subContexts.includes("8000"), `Expected "8000" in sub-contexts, got ${subContexts}`);

            // Verify keys
            const keys = await driver.keys(["bin", "fff1", "8000"]);
            assert.ok(keys.includes("prod"), `Expected "prod" in keys, got ${keys}`);
            assert.ok(keys.includes("test"), `Expected "test" in keys, got ${keys}`);

            // Verify blob data
            const blob = await driver.openBlob(["bin", "fff1", "8000"], "prod");
            const data = new Uint8Array(await blob.arrayBuffer());
            assert.deepStrictEqual(data, blobData);

            const blob2 = await driver.openBlob(["bin", "fff1", "8000"], "test");
            const data2 = new Uint8Array(await blob2.arrayBuffer());
            assert.deepStrictEqual(data2, new Uint8Array([0xaa, 0xbb]));

            // Verify has/delete work
            assert.ok(await driver.has(["bin", "fff1", "8000"], "prod"));
            assert.ok(!(await driver.has(["bin", "fff1", "8000"], "nonexistent")));

            await driver.close();
        });

        it("migrates dir blobs via blob→blob migration", async () => {
            // Create directory-format source
            const sourceRoot = resolve(TEST_STORAGE_LOCATION, `${ns}-src`);
            const sourceDir = resolve(sourceRoot, "ctx1", "ctx2");
            await mkdir(sourceDir, { recursive: true });
            await writeFile(resolve(sourceDir, "myblob"), blobData);

            const sourceFs = new NodeJsFilesystem(sourceRoot);
            const source = DirectoryBlobStorageDriver.create(new DatafileRoot(sourceFs.directory(".")), {
                kind: "dir",
            });
            await source.initialize();

            // Create target
            const targetRoot = resolve(TEST_STORAGE_LOCATION, `${ns}-tgt`);
            await mkdir(targetRoot, { recursive: true });
            const targetFs = new NodeJsFilesystem(targetRoot);
            const target = DirectoryBlobStorageDriver.create(new DatafileRoot(targetFs.directory(".")), {
                kind: "dir",
            });
            await target.initialize();

            // Blob → blob migration (same type)
            const result = await StorageMigration.migrate(source, target);

            assert.ok(result.success);
            assert.equal(result.migratedCount, 1);

            // Verify data in target
            const blob = await target.openBlob(["ctx1", "ctx2"], "myblob");
            const data = new Uint8Array(await blob.arrayBuffer());
            assert.deepStrictEqual(data, blobData);

            await source.close();
            await target.close();
            await rm(sourceRoot, { recursive: true, force: true });
            await rm(targetRoot, { recursive: true, force: true });
        });
    });

    describe("blob driver migration: all type combinations", () => {
        const blobData1 = new Uint8Array([0xca, 0xfe, 0xba, 0xbe]);
        const blobData2 = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x01, 0x02]);

        interface BlobDriverFactory {
            name: string;
            create(path: string): Promise<BlobStorageDriver>;
            cleanup(path: string): Promise<void>;
        }

        const blobDriverFactories: BlobDriverFactory[] = [
            {
                name: "file",
                async create(path: string) {
                    await mkdir(path, { recursive: true });
                    const fs = new NodeJsFilesystem(path);
                    const driver = FlatFileBlobStorageDriver.create(new DatafileRoot(fs), { kind: "file" });
                    await driver.initialize();
                    return driver;
                },
                async cleanup(path: string) {
                    await rm(path, { recursive: true, force: true });
                },
            },
            {
                name: "dir",
                async create(path: string) {
                    await mkdir(path, { recursive: true });
                    const fs = new NodeJsFilesystem(path);
                    const driver = DirectoryBlobStorageDriver.create(new DatafileRoot(fs), { kind: "dir" });
                    await driver.initialize();
                    return driver;
                },
                async cleanup(path: string) {
                    await rm(path, { recursive: true, force: true });
                },
            },
            {
                name: "wal",
                async create(path: string) {
                    await mkdir(path, { recursive: true });
                    const fs = new NodeJsFilesystem(path);
                    const driver = WalBlobStorageDriver.create(new DatafileRoot(fs), { kind: "wal" });
                    await driver.initialize();
                    return driver;
                },
                async cleanup(path: string) {
                    await rm(path, { recursive: true, force: true });
                },
            },
        ];

        // Build all blob migration pairs
        const blobPairs: { source: BlobDriverFactory; target: BlobDriverFactory }[] = [];
        for (const source of blobDriverFactories) {
            for (const target of blobDriverFactories) {
                if (source.name !== target.name) {
                    blobPairs.push({ source, target });
                }
            }
        }

        for (const pair of blobPairs) {
            describe(`${pair.source.name} → ${pair.target.name}`, () => {
                const sourceBase = `test_blob_${pair.source.name}_to_${pair.target.name}_src`;
                const targetBase = `test_blob_${pair.source.name}_to_${pair.target.name}_tgt`;

                afterEach(async () => {
                    await pair.source.cleanup(resolve(TEST_STORAGE_LOCATION, sourceBase));
                    await pair.target.cleanup(resolve(TEST_STORAGE_LOCATION, targetBase));
                });

                it("migrates blobs preserving data and structure", async () => {
                    const sourcePath = resolve(TEST_STORAGE_LOCATION, sourceBase);
                    const targetPath = resolve(TEST_STORAGE_LOCATION, targetBase);

                    const source = await pair.source.create(sourcePath);
                    const target = await pair.target.create(targetPath);

                    // Write blob data to source
                    const stream1 = new ReadableStream<Bytes>({
                        start(controller) {
                            controller.enqueue(blobData1);
                            controller.close();
                        },
                    });
                    await source.writeBlobFromStream(["bin", "fff1", "8000"], "prod", stream1);

                    const stream2 = new ReadableStream<Bytes>({
                        start(controller) {
                            controller.enqueue(blobData2);
                            controller.close();
                        },
                    });
                    await source.writeBlobFromStream(["bin", "fff1", "8000"], "test", stream2);

                    // Migrate
                    const result = await StorageMigration.migrate(source, target);

                    assert.ok(result.success, `Migration failed: ${JSON.stringify(result.skippedItems)}`);
                    assert.equal(result.migratedCount, 2);

                    // Verify data in target
                    const blob1 = await target.openBlob(["bin", "fff1", "8000"], "prod");
                    const blob1Data = new Uint8Array(await blob1.arrayBuffer());
                    assert.deepStrictEqual(blob1Data, blobData1);

                    const blob2 = await target.openBlob(["bin", "fff1", "8000"], "test");
                    const blob2Data = new Uint8Array(await blob2.arrayBuffer());
                    assert.deepStrictEqual(blob2Data, blobData2);

                    // Verify context/key structure is preserved
                    const topContexts = await target.contexts([]);
                    assert.ok(topContexts.includes("bin"), `Expected "bin" in top contexts`);

                    const keys = await target.keys(["bin", "fff1", "8000"]);
                    assert.deepStrictEqual(keys.sort(), ["prod", "test"]);

                    await source.close();
                    await target.close();
                });
            });
        }

        describe("kv(file) → dir (cross-type kv→blob extraction)", () => {
            const sourceNs = "test_kv_to_dir_blob_src";
            const targetNs = "test_kv_to_dir_blob_tgt";

            afterEach(async () => {
                await rm(resolve(TEST_STORAGE_LOCATION, sourceNs), { recursive: true, force: true });
                await rm(resolve(TEST_STORAGE_LOCATION, targetNs), { recursive: true, force: true });
            });

            it("extracts blobs from FileStorageDriver KV to DirectoryBlobStorageDriver", async () => {
                const sourcePath = resolve(TEST_STORAGE_LOCATION, sourceNs);
                const source = new FileStorageDriver(sourcePath);
                await source.initialize();

                // Write KV data (will be skipped during kv→blob migration)
                await source.set(["bin", "fff1"], "metadata", "some-value");

                // Write blob data using the legacy method
                const stream1 = new ReadableStream<Bytes>({
                    start(controller) {
                        controller.enqueue(blobData1);
                        controller.close();
                    },
                });
                await source.writeBlobFromStream(["bin", "fff1", "8000"], "prod", stream1);

                const stream2 = new ReadableStream<Bytes>({
                    start(controller) {
                        controller.enqueue(blobData2);
                        controller.close();
                    },
                });
                await source.writeBlobFromStream(["bin", "fff1", "8000"], "test", stream2);

                // Create target
                const targetPath = resolve(TEST_STORAGE_LOCATION, targetNs);
                await mkdir(targetPath, { recursive: true });
                const targetFs = new NodeJsFilesystem(targetPath);
                const target = DirectoryBlobStorageDriver.create(new DatafileRoot(targetFs.directory(".")), {
                    kind: "dir",
                });
                await target.initialize();

                // Cross-type migration: kv → blob
                const result = await StorageMigration.migrate(source, target);

                assert.ok(result.otherTypeKeysSkipped > 0, "Should skip non-blob keys");
                assert.ok(result.migratedCount >= 2, "Should migrate at least 2 blob keys");

                // Verify blobs
                const blob1 = await target.openBlob(["bin", "fff1", "8000"], "prod");
                const blob1Data = new Uint8Array(await blob1.arrayBuffer());
                assert.deepStrictEqual(blob1Data, blobData1);

                const blob2 = await target.openBlob(["bin", "fff1", "8000"], "test");
                const blob2Data = new Uint8Array(await blob2.arrayBuffer());
                assert.deepStrictEqual(blob2Data, blobData2);

                await source.close();
                await target.close();
            });
        });
    });

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
        storageService.registerDriver(FileStorageDriver);

        // Register a "mock" driver that wraps FileStorageDriver under a different id
        storageService.registerDriver({
            id: "mock",
            create(namespace, descriptor) {
                return FileStorageDriver.create(namespace, descriptor);
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

        const storage = new FileStorageDriver(nsDir);
        await storage.initialize();
        await storage.set(["context"], "key1", "value1");
        await storage.set(["context"], "key1b", 42);
        await storage.set(["context", "sub"], "key2", "value2");
        await storage.set(["context", "sub", "deep"], "key3", "value3");
        await storage.set(["other"], "otherKey", "otherValue");
        await storage.close();

        // Write driver.json marking this as "file" driver
        const fs = env.get(Filesystem);
        const dir = fs.directory(NAMESPACE);
        await dir.file("driver.json").write(JSON.stringify({ kind: "file" }));
    }

    /** Verify all data populated by populateSource is accessible through the manager */
    async function verifyMigratedData(manager: Awaited<ReturnType<StorageService["open"]>>) {
        // Top-level context with multiple keys
        const ctx = manager.createContext("context");
        assert.equal(await ctx.get("key1"), "value1");
        assert.equal(await ctx.get("key1b"), 42);

        // Nested context
        const subCtx = ctx.createContext("sub");
        assert.equal(await subCtx.get("key2"), "value2");

        // Deeply nested context
        const deepCtx = subCtx.createContext("deep");
        assert.equal(await deepCtx.get("key3"), "value3");

        // Separate top-level context
        const otherCtx = manager.createContext("other");
        assert.equal(await otherCtx.get("otherKey"), "otherValue");
    }

    it("migrates correctly and data is readable immediately after open", async () => {
        await populateSource();

        storageService.configuredDriver = "mock";

        const manager = await storageService.open(NAMESPACE);

        // Verify all migrated data is readable right away through the manager
        await verifyMigratedData(manager);

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

    it("storage is fully operational at correct path after migration", async () => {
        await populateSource();

        storageService.configuredDriver = "mock";

        const manager = await storageService.open(NAMESPACE);

        // Verify the namespace directory exists (not pointing to backup)
        const fs = env.get(Filesystem);
        const nsDir = fs.directory(NAMESPACE);
        assert.ok(await nsDir.exists(), "Namespace directory should exist");
        const driverJson = await nsDir.file("driver.json").readAllText();
        assert.equal(JSON.parse(driverJson).kind, "mock");

        // All migrated data readable immediately
        await verifyMigratedData(manager);

        // Write new data to verify storage is operational at the correct path
        const ctx = manager.createContext("context");
        await ctx.set("newKey", "newValue");
        assert.equal(await ctx.get("newKey"), "newValue");

        // Write to a new context too
        const newCtx = manager.createContext("added");
        await newCtx.set("fresh", "data");
        assert.equal(await newCtx.get("fresh"), "data");

        await manager.close();

        // Reopen and verify both migrated + new data persisted at the correct location
        storageService.configuredDriver = "mock";
        const manager2 = await storageService.open(NAMESPACE);

        // Original migrated data still there
        await verifyMigratedData(manager2);

        // Newly written data persisted
        const ctx2 = manager2.createContext("context");
        assert.equal(await ctx2.get("newKey"), "newValue");
        const addedCtx = manager2.createContext("added");
        assert.equal(await addedCtx.get("fresh"), "data");

        await manager2.close();
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
        const storage = new FileStorageDriver(resolve(rootDir, NAMESPACE));
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
