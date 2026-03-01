/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockFilesystem } from "#fs/MockFilesystem.js";
import { WalSnapshot } from "#storage/wal/WalSnapshot.js";

describe("WalSnapshot", () => {
    let fs: MockFilesystem;

    beforeEach(() => {
        fs = new MockFilesystem();
    });

    describe("load/save", () => {
        it("returns undefined when no snapshot exists", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const result = await WalSnapshot.load(storageDir);
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
            await snapshot.save(storageDir, { compress: false });

            const loaded = await WalSnapshot.load(storageDir);
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
            await snapshot.save(storageDir, { compress: false });

            const loaded = await WalSnapshot.load(storageDir);
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
            await snap1.save(storageDir, { compress: false });

            const snap2 = new WalSnapshot({ segment: 2, offset: 3 }, 2000, { b: { y: 2 } });
            await snap2.save(storageDir, { compress: false });

            const loaded = await WalSnapshot.load(storageDir);
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
            const { toJson } = await import("#storage/StringifyTools.js");
            const legacy = { commitId: { segment: 1, offset: 0 }, data: { ctx: { key: "val" } } };
            await storageDir.file("snapshot.json").write(toJson(legacy as any, 2));

            const loaded = await WalSnapshot.load(storageDir);
            expect(loaded).not.equal(undefined);
            expect(loaded!.ts).equal(0);
            expect(loaded!.data["ctx"].key).equal("val");
        });

        it("loads with custom basename", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            const snapshot = new WalSnapshot({ segment: 1, offset: 0 }, 1000, { ctx: { key: "val" } });
            await snapshot.save(storageDir, { compress: false, basename: "head" });

            const loaded = await WalSnapshot.load(storageDir, { basename: "head" });
            expect(loaded).not.equal(undefined);
            expect(loaded!.data["ctx"].key).equal("val");

            // Default basename should not find it
            const notFound = await WalSnapshot.load(storageDir);
            expect(notFound).equal(undefined);
        });
    });

    describe("query methods", () => {
        it("get returns a value", () => {
            const snapshot = new WalSnapshot({ segment: 1, offset: 0 }, 1000, {
                "ctx.sub": { key1: "value1", key2: 42 },
            });
            expect(snapshot.get(["ctx", "sub"], "key1")).equal("value1");
            expect(snapshot.get(["ctx", "sub"], "key2")).equal(42);
        });

        it("get returns undefined for missing key", () => {
            const snapshot = new WalSnapshot({ segment: 1, offset: 0 }, 1000, {
                ctx: { key: "value" },
            });
            expect(snapshot.get(["ctx"], "missing")).equal(undefined);
        });

        it("get returns undefined for missing context", () => {
            const snapshot = new WalSnapshot({ segment: 1, offset: 0 }, 1000, {});
            expect(snapshot.get(["missing"], "key")).equal(undefined);
        });

        it("keys returns all keys in a context", () => {
            const snapshot = new WalSnapshot({ segment: 1, offset: 0 }, 1000, {
                ctx: { a: 1, b: 2, c: 3 },
            });
            expect(snapshot.keys(["ctx"]).sort()).deep.equal(["a", "b", "c"]);
        });

        it("keys returns empty array for missing context", () => {
            const snapshot = new WalSnapshot({ segment: 1, offset: 0 }, 1000, {});
            expect(snapshot.keys(["missing"])).deep.equal([]);
        });

        it("values returns all values in a context", () => {
            const snapshot = new WalSnapshot({ segment: 1, offset: 0 }, 1000, {
                ctx: { a: 1, b: 2 },
            });
            expect(snapshot.values(["ctx"])).deep.equal({ a: 1, b: 2 });
        });

        it("values returns a copy", () => {
            const data = { ctx: { a: 1 } };
            const snapshot = new WalSnapshot({ segment: 1, offset: 0 }, 1000, data);
            const vals = snapshot.values(["ctx"]);
            vals.a = 99;
            expect(snapshot.get(["ctx"], "a")).equal(1);
        });

        it("contexts returns sub-contexts", () => {
            const snapshot = new WalSnapshot({ segment: 1, offset: 0 }, 1000, {
                "root.child1": { key: "v1" },
                "root.child2": { key: "v2" },
                other: { key: "v3" },
            });
            expect(snapshot.contexts(["root"]).sort()).deep.equal(["child1", "child2"]);
        });

        it("contexts returns top-level contexts when given empty array", () => {
            const snapshot = new WalSnapshot({ segment: 1, offset: 0 }, 1000, {
                "root.child": { key: "v1" },
                other: { key: "v2" },
            });
            expect(snapshot.contexts([]).sort()).deep.equal(["other", "root"]);
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
            await snapshot.save(storageDir, { compress: true });

            // Should have written .json.gz, not .json
            expect(await storageDir.file("snapshot.json.gz").exists()).equal(true);
            expect(await storageDir.file("snapshot.json").exists()).equal(false);

            const loaded = await WalSnapshot.load(storageDir);
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
            await snap.save(storageDir, { compress: false });

            // Load should auto-detect .json
            const loaded = await WalSnapshot.load(storageDir);
            expect(loaded).not.equal(undefined);
            expect(loaded!.data["ctx"].key).equal("uncompressed");
        });

        it("deletes old-format file when switching to compressed", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            // Write uncompressed
            const snap1 = new WalSnapshot({ segment: 1, offset: 0 }, 1000, { ctx: { key: "v1" } });
            await snap1.save(storageDir, { compress: false });
            expect(await storageDir.file("snapshot.json").exists()).equal(true);

            // Switch to compressed
            const snap2 = new WalSnapshot({ segment: 2, offset: 0 }, 2000, { ctx: { key: "v2" } });
            await snap2.save(storageDir, { compress: true });

            expect(await storageDir.file("snapshot.json.gz").exists()).equal(true);
            expect(await storageDir.file("snapshot.json").exists()).equal(false);
        });

        it("deletes old-format file when switching to uncompressed", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            // Write compressed
            const snap1 = new WalSnapshot({ segment: 1, offset: 0 }, 1000, { ctx: { key: "v1" } });
            await snap1.save(storageDir, { compress: true });
            expect(await storageDir.file("snapshot.json.gz").exists()).equal(true);

            // Switch to uncompressed
            const snap2 = new WalSnapshot({ segment: 2, offset: 0 }, 2000, { ctx: { key: "v2" } });
            await snap2.save(storageDir, { compress: false });

            expect(await storageDir.file("snapshot.json").exists()).equal(true);
            expect(await storageDir.file("snapshot.json.gz").exists()).equal(false);
        });

        it("prefers newer .json.gz when both files exist", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            // Write uncompressed first (older mtime)
            const snap1 = new WalSnapshot({ segment: 1, offset: 0 }, 1000, { ctx: { key: "old" } });
            await snap1.save(storageDir, { compress: false });

            // Write compressed second (newer mtime)
            const snap2 = new WalSnapshot({ segment: 2, offset: 0 }, 2000, { ctx: { key: "new" } });
            await snap2.save(storageDir, { compress: true });

            // Both files exist — should prefer the newer .json.gz
            const loaded = await WalSnapshot.load(storageDir);
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
            await snapshot.save(storageDir, { compress: true });

            const loaded = await WalSnapshot.load(storageDir);
            expect(loaded).not.equal(undefined);
            expect(loaded!.commitId).deep.equal(commitId);
            expect(loaded!.data["ctx.special"].bigint).equal(BigInt("123456789012345678"));
            expect(loaded!.data["ctx.special"].nested).deep.equal({ a: [1, "two", true] });
        });
    });
});
