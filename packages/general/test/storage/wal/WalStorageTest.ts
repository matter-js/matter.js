/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockFilesystem } from "#fs/MockFilesystem.js";
import { segmentFilename, serializeCommit, type WalCommit } from "#storage/wal/WalCommit.js";
import { WalStorage } from "#storage/wal/WalStorage.js";
import { Seconds } from "#time/TimeUnit.js";

describe("WalStorage", () => {
    before(() => MockTime.enable());

    let fs: MockFilesystem;

    beforeEach(() => {
        fs = new MockFilesystem();
    });

    async function createStorage(options?: WalStorage.Options) {
        const storageDir = fs.directory("storage");
        const storage = new WalStorage(storageDir, {
            fsync: false,
            snapshotInterval: Seconds(600),
            cleanInterval: Seconds(1200),
            ...options,
        });
        await storage.initialize();
        return storage;
    }

    it("initializes and closes cleanly", async () => {
        const storage = await createStorage();
        expect(storage.initialized).equal(true);
        await storage.close();
        expect(storage.initialized).equal(false);
    });

    it("writes and reads a value", async () => {
        const storage = await createStorage();
        await storage.set(["ctx"], "key", "value");
        expect(await storage.get(["ctx"], "key")).equal("value");
        await storage.close();
    });

    it("writes multiple values at once", async () => {
        const storage = await createStorage();
        await storage.set(["ctx"], { key1: "a", key2: "b" });
        expect(await storage.get(["ctx"], "key1")).equal("a");
        expect(await storage.get(["ctx"], "key2")).equal("b");
        await storage.close();
    });

    it("deletes a value", async () => {
        const storage = await createStorage();
        await storage.set(["ctx"], "key", "value");
        await storage.delete(["ctx"], "key");
        expect(await storage.get(["ctx"], "key")).equal(undefined);
        await storage.close();
    });

    it("clears all values in a context", async () => {
        const storage = await createStorage();
        await storage.set(["ctx"], { a: 1, b: 2 });
        await storage.clearAll(["ctx"]);
        expect(await storage.keys(["ctx"])).deep.equal([]);
        await storage.close();
    });

    it("returns keys for a context", async () => {
        const storage = await createStorage();
        await storage.set(["ctx"], { a: 1, b: 2, c: 3 });
        const keys = await storage.keys(["ctx"]);
        expect(keys.sort()).deep.equal(["a", "b", "c"]);
        await storage.close();
    });

    it("returns values for a context", async () => {
        const storage = await createStorage();
        await storage.set(["ctx"], { a: 1, b: 2 });
        const values = await storage.values(["ctx"]);
        expect(values).deep.equal({ a: 1, b: 2 });
        await storage.close();
    });

    it("returns sub-contexts", async () => {
        const storage = await createStorage();
        await storage.set(["root", "child1"], "key", "v1");
        await storage.set(["root", "child2"], "key", "v2");
        const contexts = await storage.contexts(["root"]);
        expect(contexts.sort()).deep.equal(["child1", "child2"]);
        await storage.close();
    });

    it("can close and reinitialize", async () => {
        const storageDir = fs.directory("storage");
        const storage = new WalStorage(storageDir, {
            fsync: false,
            snapshotInterval: Seconds(600),
            cleanInterval: Seconds(1200),
        });
        await storage.initialize();
        await storage.set(["ctx"], "key", "value1");
        await storage.close();

        // Reinitialize the same instance
        await storage.initialize();
        expect(await storage.get(["ctx"], "key")).equal("value1");

        // Should still be writable
        await storage.set(["ctx"], "key", "value2");
        expect(await storage.get(["ctx"], "key")).equal("value2");
        await storage.close();
    });

    it("supports nested contexts", async () => {
        const storage = await createStorage();
        await storage.set(["a", "b", "c"], "key", "deep");
        expect(await storage.get(["a", "b", "c"], "key")).equal("deep");
        await storage.close();
    });

    describe("transactions", () => {
        it("buffers writes until commit", async () => {
            const storage = await createStorage();
            await storage.set(["ctx"], "existing", "original");

            await using tx = await storage.begin();
            await tx.set(["ctx"], "key", "buffered");

            // Not visible in storage yet
            expect(await storage.get(["ctx"], "key")).equal(undefined);

            // Visible through transaction
            expect(await tx.get(["ctx"], "key")).equal("buffered");

            await tx.commit();

            // Now visible in storage
            expect(await storage.get(["ctx"], "key")).equal("buffered");
            await storage.close();
        });

        it("rolls back on dispose without commit", async () => {
            const storage = await createStorage();
            {
                await using tx = await storage.begin();
                await tx.set(["ctx"], "key", "should-not-persist");
            }
            expect(await storage.get(["ctx"], "key")).equal(undefined);
            await storage.close();
        });

        it("transaction reads overlay buffered writes", async () => {
            const storage = await createStorage();
            await storage.set(["ctx"], { a: 1, b: 2 });

            await using tx = await storage.begin();
            await tx.set(["ctx"], "a", 10);
            await tx.delete(["ctx"], "b");

            expect(await tx.get(["ctx"], "a")).equal(10);
            expect(await tx.get(["ctx"], "b")).equal(undefined);

            await tx.commit();
            expect(await storage.get(["ctx"], "a")).equal(10);
            expect(await storage.get(["ctx"], "b")).equal(undefined);
            await storage.close();
        });
    });

    describe("crash recovery", () => {
        it("recovers from WAL on restart (no snapshot)", async () => {
            const storage = await createStorage();
            await storage.set(["ctx"], "key", "persisted");
            await storage.close();

            // Reopen — should replay WAL
            const storage2 = await createStorage();
            expect(await storage2.get(["ctx"], "key")).equal("persisted");
            await storage2.close();
        });

        it("recovers from snapshot + WAL on restart", async () => {
            const storageDir = fs.directory("storage");
            const storage = new WalStorage(storageDir, {
                fsync: false,
                snapshotInterval: Seconds(600),
                cleanInterval: Seconds(1200),
            });
            await storage.initialize();

            await storage.set(["ctx"], "key1", "from-wal-1");
            await storage.set(["ctx"], "key2", "from-wal-2");
            await storage.close(); // close triggers snapshot

            // Write more data after snapshot
            const storage2 = new WalStorage(storageDir, {
                fsync: false,
                snapshotInterval: Seconds(600),
                cleanInterval: Seconds(1200),
            });
            await storage2.initialize();
            await storage2.set(["ctx"], "key3", "from-wal-3");
            await storage2.close();

            // Reopen — should load snapshot + replay remaining WAL
            const storage3 = new WalStorage(storageDir, {
                fsync: false,
                snapshotInterval: Seconds(600),
                cleanInterval: Seconds(1200),
            });
            await storage3.initialize();
            expect(await storage3.get(["ctx"], "key1")).equal("from-wal-1");
            expect(await storage3.get(["ctx"], "key2")).equal("from-wal-2");
            expect(await storage3.get(["ctx"], "key3")).equal("from-wal-3");
            await storage3.close();
        });

        it("recovers from compressed snapshot + WAL on restart", async () => {
            const storageDir = fs.directory("storage");
            const storage = new WalStorage(storageDir, {
                fsync: false,
                compressSnapshot: true,
                snapshotInterval: Seconds(600),
                cleanInterval: Seconds(1200),
            });
            await storage.initialize();

            await storage.set(["ctx"], "key1", "from-wal-1");
            await storage.set(["ctx"], "key2", "from-wal-2");
            await storage.close(); // close triggers compressed snapshot

            // Verify compressed snapshot was written
            expect(await storageDir.file("snapshot.json.gz").exists()).equal(true);
            expect(await storageDir.file("snapshot.json").exists()).equal(false);

            // Write more data after snapshot
            const storage2 = new WalStorage(storageDir, {
                fsync: false,
                compressSnapshot: true,
                snapshotInterval: Seconds(600),
                cleanInterval: Seconds(1200),
            });
            await storage2.initialize();
            await storage2.set(["ctx"], "key3", "from-wal-3");
            await storage2.close();

            // Reopen — should load compressed snapshot + replay remaining WAL
            const storage3 = new WalStorage(storageDir, {
                fsync: false,
                compressSnapshot: true,
                snapshotInterval: Seconds(600),
                cleanInterval: Seconds(1200),
            });
            await storage3.initialize();
            expect(await storage3.get(["ctx"], "key1")).equal("from-wal-1");
            expect(await storage3.get(["ctx"], "key2")).equal("from-wal-2");
            expect(await storage3.get(["ctx"], "key3")).equal("from-wal-3");
            await storage3.close();
        });

        it("handles truncated WAL lines", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const walDir = storageDir.directory("wal");
            await walDir.mkdir();

            // Write valid commit followed by truncated line
            const commit: WalCommit = { ts: 1000, ops: [{ op: "upd", key: "ctx", values: { key: "value" } }] };
            const content = serializeCommit(commit) + "\n" + '{"truncated\n';
            await walDir.file(segmentFilename(1)).write(content);

            const storage = new WalStorage(storageDir, {
                fsync: false,
                snapshotInterval: Seconds(600),
                cleanInterval: Seconds(1200),
            });
            await storage.initialize();

            // Should have recovered the valid commit
            expect(await storage.get(["ctx"], "key")).equal("value");
            await storage.close();
        });
    });

    describe("cache", () => {
        it("invalidates cache on write", async () => {
            const storage = await createStorage();

            // First write + read populates cache
            await storage.set(["ctx"], "key", "v1");
            expect(await storage.get(["ctx"], "key")).equal("v1");

            // Second write invalidates, next read reloads from disk
            await storage.set(["ctx"], "key", "v2");
            expect(await storage.get(["ctx"], "key")).equal("v2");

            await storage.close();
        });

        it("defers loading until first read", async () => {
            const storageDir = fs.directory("storage");

            // Write some data
            const storage1 = new WalStorage(storageDir, {
                fsync: false,
                snapshotInterval: Seconds(600),
                cleanInterval: Seconds(1200),
            });
            await storage1.initialize();
            await storage1.set(["ctx"], "key", "value");
            await storage1.close();

            // Reopen — initialize should not load data yet
            const storage2 = new WalStorage(storageDir, {
                fsync: false,
                snapshotInterval: Seconds(600),
                cleanInterval: Seconds(1200),
            });
            await storage2.initialize();

            // Write without reading first — should work
            await storage2.set(["ctx"], "key2", "value2");

            // Now read — loads cache from disk
            expect(await storage2.get(["ctx"], "key")).equal("value");
            expect(await storage2.get(["ctx"], "key2")).equal("value2");
            await storage2.close();
        });
    });

    describe("head snapshot", () => {
        it("creates head snapshot at truncation boundary during cleanup", async () => {
            const storageDir = fs.directory("storage");
            const storage = new WalStorage(storageDir, {
                fsync: false,
                snapshotInterval: Seconds(600),
                cleanInterval: Seconds(1200),
                maxSegmentSize: 50,
                headSnapshot: true,
            });
            await storage.initialize();

            // Write data that will span multiple segments due to small maxSegmentSize
            await storage.set(["ctx"], "key1", "value1");
            await storage.set(["ctx"], "key2", "value2");
            await storage.set(["ctx"], "key3", "value3");

            // Close triggers snapshot + clean — segments before the snapshot segment get deleted
            await storage.close();

            // Head snapshot should exist (compressed by default)
            const headExists =
                (await storageDir.file("head.json.gz").exists()) || (await storageDir.file("head.json").exists());
            expect(headExists).equal(true);
        });
    });

    describe("blobs", () => {
        it("writes and reads a blob", async () => {
            const storage = await createStorage();

            const data = new Uint8Array([1, 2, 3, 4, 5]);
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });
            await storage.writeBlobFromStream(["ctx"], "blob-key", stream);

            const blob = await storage.openBlob(["ctx"], "blob-key");
            const bytes = new Uint8Array(await blob.arrayBuffer());
            expect(bytes).deep.equal(data);

            await storage.close();
        });

        it("returns empty blob for nonexistent key", async () => {
            const storage = await createStorage();
            const blob = await storage.openBlob(["ctx"], "missing");
            expect(blob.size).equal(0);
            await storage.close();
        });
    });
});
