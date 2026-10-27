/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Directory } from "#fs/Directory.js";
import { MockFilesystem } from "#fs/MockFilesystem.js";
import { StorageError } from "#storage/StorageDriver.js";
import { toJson } from "#storage/StringifyTools.js";
import { WalSnapshot } from "#storage/wal/WalSnapshot.js";
import { WalSnapshotStore } from "#storage/wal/WalSnapshotStore.js";
import { readSnapshot } from "./snapshot-files.js";

describe("WalSnapshotStore", () => {
    let fs: MockFilesystem;

    beforeEach(() => {
        fs = new MockFilesystem();
    });

    async function restoreSnapshot(storageDir: Directory) {
        return (await new WalSnapshotStore(storageDir).restore())?.snapshot;
    }

    describe("load/save", () => {
        it("returns undefined when no snapshot exists", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const result = await restoreSnapshot(storageDir);
            expect(result).equal(undefined);
        });

        it("writes and loads a snapshot", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            const commitId = { segment: 1, offset: 5 };
            const ts = 1000;
            const data = {
                "ctx.sub": { key1: "value1", key2: 42 },
                other: { flag: true },
            };

            const snapshot = new WalSnapshot(commitId, ts, data);
            await new WalSnapshotStore(storageDir).save(snapshot, { compress: false, fsync: true });

            const loaded = await restoreSnapshot(storageDir);
            expect(loaded).not.equal(undefined);
            expect(loaded!.commitId).deep.equal(commitId);
            expect(loaded!.ts).equal(ts);
            expect(loaded!.data["ctx.sub"].key1).equal("value1");
            expect(loaded!.data["ctx.sub"].key2).equal(42);
            expect(loaded!.data["other"].flag).equal(true);
        });

        it("roundtrips special storage types through snapshot", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            const commitId = { segment: 3, offset: 7 };
            const ts = 2000;
            const data = {
                "ctx.special": {
                    bigint: BigInt("123456789012345678"),
                    buffer: new Uint8Array([1, 2, 3]).buffer,
                    nested: { a: [1, "two", true] },
                },
            };

            const snapshot = new WalSnapshot(commitId, ts, data as any);
            await new WalSnapshotStore(storageDir).save(snapshot, { compress: false, fsync: true });

            const loaded = await restoreSnapshot(storageDir);
            expect(loaded).not.equal(undefined);
            expect(loaded!.commitId).deep.equal(commitId);
            expect(loaded!.ts).equal(ts);
            expect(loaded!.data["ctx.special"].bigint).equal(BigInt("123456789012345678"));
            expect(loaded!.data["ctx.special"].nested).deep.equal({ a: [1, "two", true] });
        });

        it("overwrites previous snapshot atomically", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            const snap1 = new WalSnapshot({ segment: 1, offset: 0 }, 1000, { a: { x: 1 } });
            await new WalSnapshotStore(storageDir).save(snap1, { compress: false, fsync: true });

            const snap2 = new WalSnapshot({ segment: 2, offset: 3 }, 2000, { b: { y: 2 } });
            await new WalSnapshotStore(storageDir).save(snap2, { compress: false, fsync: true });

            const loaded = await restoreSnapshot(storageDir);
            expect(loaded!.commitId).deep.equal({ segment: 2, offset: 3 });
            expect(loaded!.ts).equal(2000);
            expect(loaded!.data["b"].y).equal(2);
            // Old data should be gone
            expect(loaded!.data["a"]).equal(undefined);
        });

        it("defaults ts to 0 for legacy snapshots without ts", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            // Write a legacy snapshot manually (no ts field)
            const legacy = { commitId: { segment: 1, offset: 0 }, data: { ctx: { key: "val" } } };
            await storageDir.file("snapshot.json").write(toJson(legacy as any, 2));

            const loaded = await restoreSnapshot(storageDir);
            expect(loaded).not.equal(undefined);
            expect(loaded!.ts).equal(0);
            expect(loaded!.data["ctx"].key).equal("val");
        });
    });

    describe("fsync", () => {
        /**
         * Record, for each fsync on a mock file handle, whether the final snapshot file already existed.
         */
        function recordFsyncs() {
            const finalFileExisted = new Array<boolean>();
            const interception = fs.intercept(async operation => {
                if (operation === "fsync") {
                    finalFileExisted.push(await fs.directory("storage").file("snapshot.json").exists());
                }
            });
            return Object.assign(finalFileExisted, { [Symbol.dispose]: () => interception[Symbol.dispose]() });
        }

        it("flushes the snapshot before renaming it into place", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            using fsyncs = recordFsyncs();

            await new WalSnapshotStore(storageDir).save(
                new WalSnapshot({ segment: 1, offset: 0 }, 1000, { ctx: { key: "value" } }),
                { compress: false, fsync: true },
            );

            expect(fsyncs).deep.equal([false]);
            expect((await restoreSnapshot(storageDir))!.data.ctx.key).equal("value");
        });

        it("reports the flush failure when closing the file fails as well", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            using _interception = fs.intercept(operation => {
                if (operation !== "open") {
                    throw new StorageError(`${operation} failed`);
                }
            });

            await expect(
                new WalSnapshotStore(storageDir).save(
                    new WalSnapshot({ segment: 1, offset: 0 }, 1000, { ctx: { key: "value" } }),
                    { compress: false, fsync: true },
                ),
            ).rejectedWith("fsync failed");
        });

        it("skips the flush when fsync is disabled", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            using fsyncs = recordFsyncs();

            await new WalSnapshotStore(storageDir).save(
                new WalSnapshot({ segment: 1, offset: 0 }, 1000, { ctx: { key: "value" } }),
                { compress: false, fsync: false },
            );

            expect(fsyncs).deep.equal([]);
        });
    });

    describe("backup", () => {
        const first = new WalSnapshot({ segment: 1, offset: 0 }, 1000, { ctx: { key: "first" } });
        const second = new WalSnapshot({ segment: 2, offset: 0 }, 2000, { ctx: { key: "second" } }, first.commitId);

        it("keeps the replaced snapshot as backup", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            await new WalSnapshotStore(storageDir).save(first, { compress: true, fsync: true });
            await new WalSnapshotStore(storageDir).save(second, { compress: true, fsync: true });

            const current = await readSnapshot(storageDir, "snapshot");
            expect(current!.commitId).deep.equal(second.commitId);
            expect(current!.backupCommitId).deep.equal(first.commitId);
            const backup = await readSnapshot(storageDir, "snapshot.prev");
            expect(backup!.data.ctx.key).equal("first");
        });

        it("stores the backup commit in the snapshot file", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            await new WalSnapshotStore(storageDir).save(second, { compress: false, fsync: false });

            const stored = JSON.parse(await storageDir.file("snapshot.json").readAllText());
            expect(stored.backupCommitId).deep.equal(first.commitId);
        });

        it("restores the current snapshot and names its backup", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            await new WalSnapshotStore(storageDir).save(first, { compress: true, fsync: true });
            await new WalSnapshotStore(storageDir).save(second, { compress: true, fsync: true });

            const restored = await new WalSnapshotStore(storageDir).restore();

            expect(restored!.snapshot.data.ctx.key).equal("second");
            expect(restored!.backupCommitId).deep.equal(first.commitId);
        });

        it("restores the backup and moves an unreadable snapshot aside", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            await new WalSnapshotStore(storageDir).save(first, { compress: true, fsync: true });
            await new WalSnapshotStore(storageDir).save(second, { compress: true, fsync: true });
            await storageDir.file("snapshot.json.gz").write("not gzip");

            const restored = await new WalSnapshotStore(storageDir).restore();

            expect(restored!.snapshot.data.ctx.key).equal("first");
            expect(restored!.backupCommitId).deep.equal(first.commitId);
            expect(await storageDir.file("snapshot.json.gz").exists()).equal(false);
            expect(await storageDir.file("snapshot.corrupt.json.gz").exists()).equal(true);
        });

        it("restores the backup when the snapshot is missing", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            await new WalSnapshotStore(storageDir).save(first, { compress: true, fsync: true });
            await new WalSnapshotStore(storageDir).save(second, { compress: true, fsync: true });
            await storageDir.file("snapshot.json.gz").delete();

            const restored = await new WalSnapshotStore(storageDir).restore();

            expect(restored!.snapshot.data.ctx.key).equal("first");
            expect(restored!.backupCommitId).deep.equal(first.commitId);
        });

        it("keeps the backup when it saves after restoring from it", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const store = new WalSnapshotStore(storageDir);
            await store.save(first, { compress: true, fsync: true });
            await store.save(second, { compress: true, fsync: true });
            await storageDir.file("snapshot.json.gz").delete();
            await store.restore();

            const third = new WalSnapshot({ segment: 3, offset: 0 }, 3000, { ctx: { key: "third" } }, first.commitId);
            await store.save(third, { compress: true, fsync: true });

            expect((await readSnapshot(storageDir, "snapshot.prev"))!.commitId).deep.equal(first.commitId);
            expect((await readSnapshot(storageDir, "snapshot"))!.commitId).deep.equal(third.commitId);
        });

        it("throws the backup's error when the snapshot is missing and the backup is unreadable", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            await storageDir.file("snapshot.prev.json").write("not json");

            await expect(new WalSnapshotStore(storageDir).restore()).rejectedWith(
                StorageError,
                "storage/snapshot.prev is unreadable",
            );
        });

        it("throws when the snapshot and the backup are unreadable", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            await new WalSnapshotStore(storageDir).save(first, { compress: true, fsync: true });
            await new WalSnapshotStore(storageDir).save(second, { compress: true, fsync: true });
            await storageDir.file("snapshot.json.gz").write("not gzip");
            await storageDir.file("snapshot.prev.json.gz").write("not gzip");

            await expect(new WalSnapshotStore(storageDir).restore()).rejectedWith(
                StorageError,
                "Snapshot and backup snapshot in storage are unreadable",
            );
        });

        it("throws when the snapshot is unreadable and no backup exists", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            await storageDir.file("snapshot.json").write("{}");

            await expect(new WalSnapshotStore(storageDir).restore()).rejectedWith("has no valid commitId");
        });

        it("removes a backup that predates a snapshot without backupCommitId", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            await new WalSnapshotStore(storageDir).save(first, { compress: true, fsync: true });
            await new WalSnapshotStore(storageDir).save(
                new WalSnapshot({ segment: 3, offset: 0 }, 3000, { ctx: { key: "third" } }),
                { compress: true, fsync: true },
            );

            const restored = await new WalSnapshotStore(storageDir).restore();

            expect(restored!.snapshot.data.ctx.key).equal("third");
            expect(restored!.backupCommitId).equal(undefined);
            expect(await storageDir.file("snapshot.prev.json.gz").exists()).equal(false);
        });

        it("returns undefined when no snapshot was written", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            expect(await new WalSnapshotStore(storageDir).restore()).equal(undefined);
        });
    });

    describe("validation", () => {
        for (const [what, content, message] of [
            ["invalid JSON", "{ not json", "is unreadable"],
            ["an array", "[]", "is not an object"],
            ["a commitId without offset", '{"commitId":{"segment":1},"data":{}}', "has no valid commitId"],
            ["a fractional segment", '{"commitId":{"segment":1.5,"offset":0},"data":{}}', "has no valid commitId"],
            ["a segment above 32 bits", '{"commitId":{"segment":1e10,"offset":0},"data":{}}', "has no valid commitId"],
            ["a negative offset", '{"commitId":{"segment":1,"offset":-1},"data":{}}', "has no valid commitId"],
            ["an offset above 16 bits", '{"commitId":{"segment":1,"offset":65536},"data":{}}', "has no valid commitId"],
            ["data that is not an object", '{"commitId":{"segment":1,"offset":0},"data":[]}', "data is not an object"],
        ]) {
            it(`rejects a snapshot with ${what}`, async () => {
                const storageDir = fs.directory("storage");
                await storageDir.mkdir();
                await storageDir.file("snapshot.json").write(content);

                await expect(restoreSnapshot(storageDir)).rejectedWith(StorageError, message);
            });
        }

        it("rejects a snapshot whose data is not an object of contexts", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            await storageDir.file("snapshot.json").write('{"commitId":{"segment":1,"offset":0},"data":{"ctx":1}}');

            await expect(restoreSnapshot(storageDir)).rejectedWith("data is not an object of contexts");
        });

        it("rejects an unreadable snapshot with a StorageError", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            await storageDir.file("snapshot.json.gz").write("not gzip");

            await expect(restoreSnapshot(storageDir)).rejectedWith(StorageError, "storage/snapshot is unreadable");
        });

        it("rejects an invalid backupCommitId", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            await storageDir
                .file("snapshot.json")
                .write('{"commitId":{"segment":1,"offset":0},"data":{},"backupCommitId":7}');

            await expect(restoreSnapshot(storageDir)).rejectedWith("invalid backupCommitId");
        });
    });

    describe("compression", () => {
        it("writes and loads a compressed snapshot", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            const commitId = { segment: 1, offset: 5 };
            const data = {
                "ctx.sub": { key1: "value1", key2: 42 },
                other: { flag: true },
            };

            const snapshot = new WalSnapshot(commitId, 1000, data);
            await new WalSnapshotStore(storageDir).save(snapshot, { compress: true, fsync: true });

            // Should have written .json.gz, not .json
            expect(await storageDir.file("snapshot.json.gz").exists()).equal(true);
            expect(await storageDir.file("snapshot.json").exists()).equal(false);

            const loaded = await restoreSnapshot(storageDir);
            expect(loaded).not.equal(undefined);
            expect(loaded!.commitId).deep.equal(commitId);
            expect(loaded!.data["ctx.sub"].key1).equal("value1");
            expect(loaded!.data["ctx.sub"].key2).equal(42);
            expect(loaded!.data["other"].flag).equal(true);
        });

        it("auto-detects uncompressed snapshot when compressed expected", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            // Write uncompressed
            const snap = new WalSnapshot({ segment: 1, offset: 0 }, 1000, { ctx: { key: "uncompressed" } });
            await new WalSnapshotStore(storageDir).save(snap, { compress: false, fsync: true });

            // Load should auto-detect .json
            const loaded = await restoreSnapshot(storageDir);
            expect(loaded).not.equal(undefined);
            expect(loaded!.data["ctx"].key).equal("uncompressed");
        });

        it("moves the old-format file to the backup when switching to compressed", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            // Write uncompressed
            const snap1 = new WalSnapshot({ segment: 1, offset: 0 }, 1000, { ctx: { key: "v1" } });
            await new WalSnapshotStore(storageDir).save(snap1, { compress: false, fsync: true });
            expect(await storageDir.file("snapshot.json").exists()).equal(true);

            // Switch to compressed
            const snap2 = new WalSnapshot({ segment: 2, offset: 0 }, 2000, { ctx: { key: "v2" } });
            await new WalSnapshotStore(storageDir).save(snap2, { compress: true, fsync: true });

            expect(await storageDir.file("snapshot.json.gz").exists()).equal(true);
            expect(await storageDir.file("snapshot.json").exists()).equal(false);
            expect(await storageDir.file("snapshot.prev.json").exists()).equal(true);
        });

        it("moves the old-format file to the backup when switching to uncompressed", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            // Write compressed
            const snap1 = new WalSnapshot({ segment: 1, offset: 0 }, 1000, { ctx: { key: "v1" } });
            await new WalSnapshotStore(storageDir).save(snap1, { compress: true, fsync: true });
            expect(await storageDir.file("snapshot.json.gz").exists()).equal(true);

            // Switch to uncompressed
            const snap2 = new WalSnapshot({ segment: 2, offset: 0 }, 2000, { ctx: { key: "v2" } });
            await new WalSnapshotStore(storageDir).save(snap2, { compress: false, fsync: true });

            expect(await storageDir.file("snapshot.json").exists()).equal(true);
            expect(await storageDir.file("snapshot.json.gz").exists()).equal(false);
            expect(await storageDir.file("snapshot.prev.json.gz").exists()).equal(true);
        });

        it("prefers newer .json.gz when both files exist", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            const snap1 = new WalSnapshot({ segment: 1, offset: 0 }, 1000, { ctx: { key: "old" } });
            await new WalSnapshotStore(storageDir).save(snap1, { compress: false, fsync: true });

            // save() never leaves both formats, so copy in a compressed file written elsewhere
            const otherDir = fs.directory("other");
            await otherDir.mkdir();
            await new WalSnapshotStore(otherDir).save(
                new WalSnapshot({ segment: 2, offset: 0 }, 2000, { ctx: { key: "new" } }),
                { compress: true, fsync: true },
            );
            await storageDir.file("snapshot.json.gz").write(otherDir.file("snapshot.json.gz").readBytes());

            // Both files exist — should prefer the newer .json.gz
            const loaded = await restoreSnapshot(storageDir);
            expect(loaded).not.equal(undefined);
            expect(loaded!.data["ctx"].key).equal("new");
            expect(loaded!.commitId).deep.equal({ segment: 2, offset: 0 });
        });

        it("roundtrips special storage types through compressed snapshot", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            const commitId = { segment: 3, offset: 7 };
            const data = {
                "ctx.special": {
                    bigint: BigInt("123456789012345678"),
                    buffer: new Uint8Array([1, 2, 3]).buffer,
                    nested: { a: [1, "two", true] },
                },
            };

            const snapshot = new WalSnapshot(commitId, 2000, data as any);
            await new WalSnapshotStore(storageDir).save(snapshot, { compress: true, fsync: true });

            const loaded = await restoreSnapshot(storageDir);
            expect(loaded).not.equal(undefined);
            expect(loaded!.commitId).deep.equal(commitId);
            expect(loaded!.data["ctx.special"].bigint).equal(BigInt("123456789012345678"));
            expect(loaded!.data["ctx.special"].nested).deep.equal({ a: [1, "two", true] });
        });
    });
});
