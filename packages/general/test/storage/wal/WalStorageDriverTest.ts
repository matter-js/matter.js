/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockFilesystem } from "#fs/MockFilesystem.js";
import { toJson } from "#storage/StringifyTools.js";
import { segmentFilename, serializeCommit, type WalCommit } from "#storage/wal/WalCommit.js";
import { WalSnapshot } from "#storage/wal/WalSnapshot.js";
import { WalStorageDriver } from "#storage/wal/WalStorageDriver.js";
import { Seconds } from "#time/TimeUnit.js";

describe("WalStorageDriver", () => {
    before(() => MockTime.enable());

    let fs: MockFilesystem;

    beforeEach(() => {
        fs = new MockFilesystem();
    });

    async function createStorage(options?: WalStorageDriver.Options) {
        const storageDir = fs.directory("storage");
        const storage = new WalStorageDriver(undefined, {
            storageDir,
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
        const storage = new WalStorageDriver(undefined, {
            storageDir,
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

    it("allows root-level keys with empty context", async () => {
        const storage = await createStorage();
        await storage.set([], "key", "value");
        expect(await storage.get([], "key")).equal("value");
        expect(await storage.keys([])).deep.equal(["key"]);
        await storage.delete([], "key");
        expect(await storage.keys([])).deep.equal([]);
        await storage.close();
    });

    it("root-level keys coexist with context keys", async () => {
        const storage = await createStorage();

        await storage.set([], "rootKey", "rootValue");
        await storage.set([], { rootA: "a", rootB: "b" });
        await storage.set(["ctx"], "ctxKey", "ctxValue");
        await storage.set(["ctx", "sub"], "subKey", "subValue");

        // Root-level keys are isolated
        expect((await storage.keys([])).sort()).deep.equal(["rootA", "rootB", "rootKey"]);
        expect(await storage.get([], "rootKey")).equal("rootValue");
        expect(await storage.values([])).deep.equal({ rootKey: "rootValue", rootA: "a", rootB: "b" });

        // Context keys are unaffected
        expect(await storage.keys(["ctx"])).deep.equal(["ctxKey"]);
        expect(await storage.get(["ctx"], "ctxKey")).equal("ctxValue");

        // contexts([]) still returns top-level contexts
        expect(await storage.contexts([])).deep.members(["ctx"]);

        // Delete root key doesn't affect context keys
        await storage.delete([], "rootKey");
        expect((await storage.keys([])).sort()).deep.equal(["rootA", "rootB"]);
        expect(await storage.keys(["ctx"])).deep.equal(["ctxKey"]);

        await storage.close();
    });

    it("root-level keys persist across restart", async () => {
        const storageDir = fs.directory("storage");
        const opts: WalStorageDriver.Options = {
            storageDir,
            fsync: false,
            snapshotInterval: Seconds(600),
            cleanInterval: Seconds(1200),
        };

        const storage = new WalStorageDriver(undefined, opts);
        await storage.initialize();
        await storage.set([], "rootKey", "persisted");
        await storage.set(["ctx"], "ctxKey", "alsoHere");
        await storage.close();

        const storage2 = new WalStorageDriver(undefined, opts);
        await storage2.initialize();
        expect(await storage2.get([], "rootKey")).equal("persisted");
        expect(await storage2.get(["ctx"], "ctxKey")).equal("alsoHere");
        expect(await storage2.keys([])).deep.equal(["rootKey"]);
        await storage2.close();
    });

    it("supports nested contexts", async () => {
        const storage = await createStorage();
        await storage.set(["a", "b", "c"], "key", "deep");
        expect(await storage.get(["a", "b", "c"], "key")).equal("deep");
        await storage.close();
    });

    it("handles concurrent writes without data loss", async () => {
        const storageDir = fs.directory("storage");
        const storage = new WalStorageDriver(undefined, {
            storageDir,
            fsync: false,
            snapshotInterval: Seconds(600),
            cleanInterval: Seconds(1200),
        });
        await storage.initialize();

        // Fire 20 concurrent set() calls to different keys
        const count = 20;
        await Promise.all(Array.from({ length: count }, (_, i) => storage.set(["ctx"], `key${i}`, `value${i}`)));
        await storage.close();

        // Reopen and verify every write landed
        const storage2 = new WalStorageDriver(undefined, {
            storageDir,
            fsync: false,
            snapshotInterval: Seconds(600),
            cleanInterval: Seconds(1200),
        });
        await storage2.initialize();

        for (let i = 0; i < count; i++) {
            expect(await storage2.get(["ctx"], `key${i}`)).equal(`value${i}`);
        }
        await storage2.close();
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
            const storage = new WalStorageDriver(undefined, {
                storageDir,
                fsync: false,
                snapshotInterval: Seconds(600),
                cleanInterval: Seconds(1200),
            });
            await storage.initialize();

            await storage.set(["ctx"], "key1", "from-wal-1");
            await storage.set(["ctx"], "key2", "from-wal-2");
            await storage.close(); // close triggers snapshot

            // Write more data after snapshot
            const storage2 = new WalStorageDriver(undefined, {
                storageDir,
                fsync: false,
                snapshotInterval: Seconds(600),
                cleanInterval: Seconds(1200),
            });
            await storage2.initialize();
            await storage2.set(["ctx"], "key3", "from-wal-3");
            await storage2.close();

            // Reopen — should load snapshot + replay remaining WAL
            const storage3 = new WalStorageDriver(undefined, {
                storageDir,
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
            const storage = new WalStorageDriver(undefined, {
                storageDir,
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
            const storage2 = new WalStorageDriver(undefined, {
                storageDir,
                fsync: false,
                compressSnapshot: true,
                snapshotInterval: Seconds(600),
                cleanInterval: Seconds(1200),
            });
            await storage2.initialize();
            await storage2.set(["ctx"], "key3", "from-wal-3");
            await storage2.close();

            // Reopen — should load compressed snapshot + replay remaining WAL
            const storage3 = new WalStorageDriver(undefined, {
                storageDir,
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

            const storage = new WalStorageDriver(undefined, {
                storageDir,
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
            const storage1 = new WalStorageDriver(undefined, {
                storageDir,
                fsync: false,
                snapshotInterval: Seconds(600),
                cleanInterval: Seconds(1200),
            });
            await storage1.initialize();
            await storage1.set(["ctx"], "key", "value");
            await storage1.close();

            // Reopen — initialize should not load data yet
            const storage2 = new WalStorageDriver(undefined, {
                storageDir,
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
            const storage = new WalStorageDriver(undefined, {
                storageDir,
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

    describe("snapshotAtTime", () => {
        it("returns full state when no asOf given", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const walDir = storageDir.directory("wal");
            await walDir.mkdir();

            const commit1: WalCommit = { ts: 1000, ops: [{ op: "upd", key: "ctx", values: { key1: "a" } }] };
            const commit2: WalCommit = { ts: 2000, ops: [{ op: "upd", key: "ctx", values: { key2: "b" } }] };
            await walDir
                .file(segmentFilename(1))
                .write(serializeCommit(commit1) + "\n" + serializeCommit(commit2) + "\n");

            const storage = new WalStorageDriver(undefined, {
                storageDir,
                fsync: false,
                snapshotInterval: Seconds(600),
            });
            await storage.initialize();

            const snap = await storage.snapshotAtTime();
            expect(snap.get(["ctx"], "key1")).equal("a");
            expect(snap.get(["ctx"], "key2")).equal("b");
            expect(snap.ts).equal(2000);

            await storage.close();
        });

        it("returns partial state at mid-history time", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const walDir = storageDir.directory("wal");
            await walDir.mkdir();

            const commit1: WalCommit = { ts: 1000, ops: [{ op: "upd", key: "ctx", values: { key1: "a" } }] };
            const commit2: WalCommit = { ts: 2000, ops: [{ op: "upd", key: "ctx", values: { key2: "b" } }] };
            const commit3: WalCommit = { ts: 3000, ops: [{ op: "upd", key: "ctx", values: { key3: "c" } }] };
            await walDir
                .file(segmentFilename(1))
                .write(
                    serializeCommit(commit1) + "\n" + serializeCommit(commit2) + "\n" + serializeCommit(commit3) + "\n",
                );

            const storage = new WalStorageDriver(undefined, {
                storageDir,
                fsync: false,
                snapshotInterval: Seconds(600),
            });
            await storage.initialize();

            const snap = await storage.snapshotAtTime(2500);
            expect(snap.get(["ctx"], "key1")).equal("a");
            expect(snap.get(["ctx"], "key2")).equal("b");
            expect(snap.get(["ctx"], "key3")).equal(undefined);
            expect(snap.ts).equal(2000);

            await storage.close();
        });

        it("throws for future timestamp", async () => {
            const storage = await createStorage();
            await storage.set(["ctx"], "key", "value");

            await expect(storage.snapshotAtTime(Date.now() + 1_000_000)).rejectedWith("Timestamp is in the future");

            await storage.close();
        });

        it("throws when timestamp predates available logs", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const walDir = storageDir.directory("wal");
            await walDir.mkdir();

            // Create a snapshot with ts=5000 as the base
            const baseSnap = new WalSnapshot({ segment: 1, offset: 0 }, 5000, { ctx: { key: "val" } });
            await baseSnap.save(storageDir, { compress: false });

            // Add a WAL commit after the snapshot
            const commit: WalCommit = { ts: 6000, ops: [{ op: "upd", key: "ctx", values: { key2: "val2" } }] };
            await walDir.file(segmentFilename(1)).write(serializeCommit(commit) + "\n");

            const storage = new WalStorageDriver(undefined, {
                storageDir,
                fsync: false,
                snapshotInterval: Seconds(600),
            });
            await storage.initialize();

            await expect(storage.snapshotAtTime(3000)).rejectedWith("Timestamp predates available logs");

            await storage.close();
        });

        it("handles legacy commits with ts=0", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const walDir = storageDir.directory("wal");
            await walDir.mkdir();

            // Legacy bare-array format (will be parsed as ts=0)
            const legacyLine = toJson([{ op: "upd", key: "ctx", values: { key1: "legacy" } }] as any);
            const commit2: WalCommit = { ts: 2000, ops: [{ op: "upd", key: "ctx", values: { key2: "modern" } }] };
            await walDir.file(segmentFilename(1)).write(legacyLine + "\n" + serializeCommit(commit2) + "\n");

            const storage = new WalStorageDriver(undefined, {
                storageDir,
                fsync: false,
                snapshotInterval: Seconds(600),
            });
            await storage.initialize();

            // Legacy commits (ts=0) are always included since 0 > asOf is false
            const snap = await storage.snapshotAtTime(1500);
            expect(snap.get(["ctx"], "key1")).equal("legacy");
            expect(snap.get(["ctx"], "key2")).equal(undefined);

            await storage.close();
        });

        it("returns snapshot state when WAL is empty after snapshot", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const walDir = storageDir.directory("wal");
            await walDir.mkdir();

            // Create a base snapshot
            const baseSnap = new WalSnapshot({ segment: 1, offset: 0 }, 5000, { ctx: { key: "val" } });
            await baseSnap.save(storageDir, { compress: false });

            const storage = new WalStorageDriver(undefined, {
                storageDir,
                fsync: false,
                snapshotInterval: Seconds(600),
            });
            await storage.initialize();

            const snap = await storage.snapshotAtTime(6000);
            expect(snap.get(["ctx"], "key")).equal("val");
            expect(snap.ts).equal(5000);

            await storage.close();
        });
    });

    describe("snapshotAtCommit", () => {
        it("returns full state when no commitId given", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const walDir = storageDir.directory("wal");
            await walDir.mkdir();

            const commit1: WalCommit = { ts: 1000, ops: [{ op: "upd", key: "ctx", values: { key1: "a" } }] };
            const commit2: WalCommit = { ts: 2000, ops: [{ op: "upd", key: "ctx", values: { key2: "b" } }] };
            await walDir
                .file(segmentFilename(1))
                .write(serializeCommit(commit1) + "\n" + serializeCommit(commit2) + "\n");

            const storage = new WalStorageDriver(undefined, {
                storageDir,
                fsync: false,
                snapshotInterval: Seconds(600),
            });
            await storage.initialize();

            const snap = await storage.snapshotAtCommit();
            expect(snap.get(["ctx"], "key1")).equal("a");
            expect(snap.get(["ctx"], "key2")).equal("b");

            await storage.close();
        });

        it("returns state through the given commit", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const walDir = storageDir.directory("wal");
            await walDir.mkdir();

            const commit1: WalCommit = { ts: 1000, ops: [{ op: "upd", key: "ctx", values: { key1: "a" } }] };
            const commit2: WalCommit = { ts: 2000, ops: [{ op: "upd", key: "ctx", values: { key2: "b" } }] };
            const commit3: WalCommit = { ts: 3000, ops: [{ op: "upd", key: "ctx", values: { key3: "c" } }] };
            await walDir
                .file(segmentFilename(1))
                .write(
                    serializeCommit(commit1) + "\n" + serializeCommit(commit2) + "\n" + serializeCommit(commit3) + "\n",
                );

            const storage = new WalStorageDriver(undefined, {
                storageDir,
                fsync: false,
                snapshotInterval: Seconds(600),
            });
            await storage.initialize();

            // Stop at commit {segment: 1, offset: 1} — includes commits 0 and 1
            const snap = await storage.snapshotAtCommit({ segment: 1, offset: 1 });
            expect(snap.get(["ctx"], "key1")).equal("a");
            expect(snap.get(["ctx"], "key2")).equal("b");
            expect(snap.get(["ctx"], "key3")).equal(undefined);
            expect(snap.commitId).deep.equal({ segment: 1, offset: 1 });

            await storage.close();
        });

        it("throws when no data available", async () => {
            const storage = await createStorage();

            await expect(storage.snapshotAtCommit()).rejectedWith("No data available");

            await storage.close();
        });
    });
});
