/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment } from "#environment/Environment.js";
import { Filesystem } from "#fs/Filesystem.js";
import { MockFilesystem } from "#fs/MockFilesystem.js";
import { NoProviderError } from "#MatterError.js";
import { DatafileRoot } from "#storage/DatafileRoot.js";
import { MemoryBlobStorageDriver } from "#storage/MemoryBlobStorageDriver.js";
import { MemoryStorageDriver } from "#storage/MemoryStorageDriver.js";
import { StorageError } from "#storage/StorageDriver.js";
import { StorageService } from "#storage/StorageService.js";
import { WalStorageDriver } from "#storage/wal/WalStorageDriver.js";

describe("StorageService", () => {
    let env: Environment;
    let storageService: StorageService;

    beforeEach(() => {
        env = new Environment("test-storage-service");
        storageService = env.get(StorageService);

        storageService.defaultDriver = "memory";
        storageService.registerDriver({
            id: "memory",
            create() {
                return MemoryStorageDriver.create();
            },
        });
    });

    it("opening the same namespace twice returns usable managers", async () => {
        const manager1 = await storageService.open("ns");
        const manager2 = await storageService.open("ns");

        // Both managers must be fully initialized and functional
        const ctx1 = manager1.createContext("a");
        ctx1.set("key", "from-manager1");

        const ctx2 = manager2.createContext("a");
        expect(ctx2.get("key")).equal("from-manager1");

        await manager1.close();
        await manager2.close();
    });

    it("second open after close creates fresh driver", async () => {
        const manager1 = await storageService.open("ns");
        const ctx1 = manager1.createContext("a");
        ctx1.set("key", "value1");
        await manager1.close();

        const manager2 = await storageService.open("ns");
        const ctx2 = manager2.createContext("a");
        // Fresh driver — no data from previous session
        expect(ctx2.has("key")).equal(false);

        await manager2.close();
    });

    it("does not reuse a driver whose open failed", async () => {
        class UnclearableDriver extends MemoryStorageDriver {
            override clearAll(): void {
                throw new StorageError("simulated clear failure");
            }
        }

        const created = new Array<UnclearableDriver>();
        storageService.registerDriver({
            id: "unclearable",
            create() {
                const driver = new UnclearableDriver();
                driver.initialize();
                created.push(driver);
                return driver;
            },
        });
        storageService.defaultDriver = "unclearable";
        storageService.clearOnFirstOpen = true;

        await expect(storageService.open("unclearable-ns")).rejectedWith(StorageError);

        storageService.clearOnFirstOpen = false;
        const manager = await storageService.open("unclearable-ns");

        // A second driver proves the failed open left no cache entry behind for this one to adopt
        expect(created.length).equal(2);
        await manager.createContext("ctx").set("key", "value");
        expect(await manager.createContext("ctx").get("key")).equal("value");
        await manager.close();
    });

    // Covers the general-package-registered "memory" and "wal" KV/blob drivers. "file"/"sqlite" KV and
    // "file"/"dir"/"wal" blob drivers are nodejs-specific and covered in
    // packages/nodejs/test/storage/StorageMigrationTest.ts's "StorageService clearOnFirstOpen" describe.
    describe("clearOnFirstOpen", () => {
        it(`clears an existing real "memory" KV namespace (smoke test)`, async () => {
            // MemoryStorageDriver.create() returns a fresh, empty instance either way, so this only exercises the
            // clearAll([]) call site; the "persistent (web-storage-style) driver" test below proves data is gone.
            storageService.clearOnFirstOpen = true;

            const manager = await storageService.open("clear-memory-ns");
            expect(await manager.createContext("ctx").has("key")).equal(false);
            await manager.createContext("ctx").set("key", "fresh-value");
            await manager.close();
        });

        it("wipes existing data on first open, but not on a later reopen (persistent non-filesystem driver)", async () => {
            const driver = new MemoryStorageDriver();
            driver.initialize();
            storageService.registerDriver({
                id: "persistent",
                create() {
                    if (!driver.initialized) {
                        driver.initialize();
                    }
                    return driver;
                },
            });
            storageService.defaultDriver = "persistent";

            const manager1 = await storageService.open("clear-ns");
            await manager1.createContext("ctx").set("key", "stale-value");
            expect(await manager1.createContext("ctx").get("key")).equal("stale-value");
            await manager1.close();

            storageService.clearOnFirstOpen = true;

            const manager2 = await storageService.open("clear-ns");
            expect(await manager2.createContext("ctx").has("key")).equal(false);
            await manager2.createContext("ctx").set("key", "fresh-value");
            await manager2.close();

            // Namespace was already cleared once in this process — reopening must not wipe "fresh-value"
            const manager3 = await storageService.open("clear-ns");
            expect(await manager3.createContext("ctx").get("key")).equal("fresh-value");
            await manager3.close();
        });

        it("clears blob namespaces too (persistent non-filesystem driver)", async () => {
            class PersistentBlobDriver extends MemoryBlobStorageDriver {
                override close() {
                    // Simulates a Web Storage/AsyncStorage-style driver: closing the handle does not erase the
                    // persisted backing store.
                }
            }

            const driver = new PersistentBlobDriver();
            storageService.registerBlobDriver({
                id: "persistent-blob",
                create() {
                    return driver;
                },
            });
            storageService.defaultBlobDriver = "persistent-blob";

            const handle1 = await storageService.openBlobStorage("clear-blob-ns");
            driver.setBytes(["ctx"], "key", new Uint8Array([1, 2, 3]));
            expect(driver.has(["ctx"], "key")).equal(true);
            await handle1.close();

            storageService.clearOnFirstOpen = true;

            const handle2 = await storageService.openBlobStorage("clear-blob-ns");
            expect(await handle2.driver.has(["ctx"], "key")).equal(false);
            await handle2.close();
        });

        it(`wipes an existing "wal" KV namespace before creating the driver, skipping detection and migration`, async () => {
            const mockFs = new MockFilesystem();
            env.set(Filesystem, mockFs);
            storageService.registerDriver(WalStorageDriver);
            // Register a second id backed by the same implementation, so a hypothetical non-clear open would find
            // configuredDriver ("wal") genuinely different from the detected kind ("walDup") and attempt a real
            // migration between two registered drivers.
            storageService.registerDriver({ id: "walDup", create: WalStorageDriver.create });
            storageService.defaultDriver = "wal";
            storageService.configuredDriver = "wal";

            const ns = "clear-fs-ns";
            const nsDir = mockFs.directory(ns);

            // Populate the namespace under "walDup" plus a legacy sqlite sibling file, so clearing must skip both
            // detection/migration and the sibling wipe must remove the leftover marker.
            const existing = await WalStorageDriver.create(new DatafileRoot(nsDir), { kind: "walDup" });
            await existing.set(["ctx"], "key", "stale-value");
            expect(await existing.get(["ctx"], "key")).equal("stale-value");
            await existing.close();
            await nsDir.file("driver.json").write(JSON.stringify({ kind: "walDup", type: "kv" }));
            await mockFs.file(`${ns}.db`).write("legacy-sqlite-marker");

            storageService.clearOnFirstOpen = true;

            const manager = await storageService.open(ns);
            expect(await manager.createContext("ctx").has("key")).equal(false);
            await manager.close();

            const descriptorText = await nsDir.file("driver.json").readAllText();
            expect(JSON.parse(descriptorText).kind).equal("wal");

            expect(await mockFs.file(`${ns}.db`).exists()).equal(false);
            expect(await mockFs.directory(".migrations").exists()).equal(false);
        });

        it("preserves the KV/blob type-mismatch guard when clearing", async () => {
            const mockFs = new MockFilesystem();
            env.set(Filesystem, mockFs);
            storageService.registerDriver(WalStorageDriver);
            storageService.defaultDriver = "wal";

            const ns = "clear-type-mismatch-ns";
            const nsDir = mockFs.directory(ns);

            // Mark the namespace as blob storage, as openBlobStorage() would
            await nsDir.file("driver.json").write(JSON.stringify({ kind: "dir", type: "blob" }));
            await nsDir.file("some-blob-file").write("blob-bytes");

            storageService.clearOnFirstOpen = true;

            await expect(storageService.open(ns)).rejectedWith("blob storage");

            // The guard must fire before any wipe
            expect(await nsDir.file("some-blob-file").exists()).equal(true);
            const descriptorText = await nsDir.file("driver.json").readAllText();
            expect(JSON.parse(descriptorText).type).equal("blob");
        });

        it("rejects an unregistered KV driver before wiping", async () => {
            const mockFs = new MockFilesystem();
            env.set(Filesystem, mockFs);
            storageService.registerDriver(WalStorageDriver);
            storageService.defaultDriver = "wal";
            storageService.configuredDriver = "waal";

            const ns = "clear-bad-driver-ns";
            const nsDir = mockFs.directory(ns);

            const existing = await WalStorageDriver.create(new DatafileRoot(nsDir), { kind: "wal" });
            await existing.set(["ctx"], "key", "stale-value");
            await existing.close();
            await nsDir.file("driver.json").write(JSON.stringify({ kind: "wal", type: "kv" }));

            storageService.clearOnFirstOpen = true;

            await expect(storageService.open(ns)).rejectedWith(NoProviderError);

            storageService.configuredDriver = undefined;
            storageService.clearOnFirstOpen = false;

            const manager = await storageService.open(ns);
            expect(await manager.createContext("ctx").get("key")).equal("stale-value");
            await manager.close();
        });

        it("rejects an unregistered blob driver before wiping", async () => {
            const mockFs = new MockFilesystem();
            env.set(Filesystem, mockFs);
            storageService.registerBlobDriver({ id: "memory-blob", create: () => new MemoryBlobStorageDriver() });
            storageService.defaultBlobDriver = "memory-blob";
            storageService.configuredBlobDriver = "memory-blobb";

            const ns = "clear-bad-blob-driver-ns";
            const nsDir = mockFs.directory(ns);
            await nsDir.file("existing-blob").write("blob-bytes");

            storageService.clearOnFirstOpen = true;

            await expect(storageService.openBlobStorage(ns)).rejectedWith(NoProviderError);

            expect(await nsDir.file("existing-blob").exists()).equal(true);
        });

        it("does not wipe a filesystem namespace on a later reopen", async () => {
            const mockFs = new MockFilesystem();
            env.set(Filesystem, mockFs);
            storageService.registerDriver(WalStorageDriver);
            storageService.defaultDriver = "wal";

            storageService.clearOnFirstOpen = true;

            const manager1 = await storageService.open("clear-fs-ns2");
            await manager1.createContext("ctx").set("key", "fresh-value");
            await manager1.close();

            const manager2 = await storageService.open("clear-fs-ns2");
            expect(await manager2.createContext("ctx").get("key")).equal("fresh-value");
            await manager2.close();
        });
    });
});
