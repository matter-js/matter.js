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

    it("returns undefined when no snapshot exists", async () => {
        const storageDir = fs.directory("storage");
        await storageDir.mkdir();
        const snapshot = new WalSnapshot(storageDir, false);
        const result = await snapshot.load();
        expect(result).equal(undefined);
    });

    it("writes and loads a snapshot", async () => {
        const storageDir = fs.directory("storage");
        await storageDir.mkdir();
        const snapshot = new WalSnapshot(storageDir, false);

        const commitId = { segment: 1, offset: 5 };
        const data = {
            "ctx.sub": { key1: "value1", key2: 42 },
            other: { flag: true },
        };

        await snapshot.run(commitId, data);

        const loaded = await snapshot.load();
        expect(loaded).not.equal(undefined);
        expect(loaded!.commitId).deep.equal(commitId);
        expect(loaded!.data["ctx.sub"].key1).equal("value1");
        expect(loaded!.data["ctx.sub"].key2).equal(42);
        expect(loaded!.data["other"].flag).equal(true);
    });

    it("roundtrips special storage types through snapshot", async () => {
        const storageDir = fs.directory("storage");
        await storageDir.mkdir();
        const snapshot = new WalSnapshot(storageDir, false);

        const commitId = { segment: 3, offset: 7 };
        const data = {
            "ctx.special": {
                bigint: BigInt("123456789012345678"),
                buffer: new Uint8Array([1, 2, 3]).buffer,
                nested: { a: [1, "two", true] },
            },
        };

        await snapshot.run(commitId, data as any);

        const loaded = await snapshot.load();
        expect(loaded).not.equal(undefined);
        expect(loaded!.commitId).deep.equal(commitId);
        expect(loaded!.data["ctx.special"].bigint).equal(BigInt("123456789012345678"));
        expect(loaded!.data["ctx.special"].nested).deep.equal({ a: [1, "two", true] });
    });

    it("overwrites previous snapshot atomically", async () => {
        const storageDir = fs.directory("storage");
        await storageDir.mkdir();
        const snapshot = new WalSnapshot(storageDir, false);

        await snapshot.run({ segment: 1, offset: 0 }, { a: { x: 1 } });
        await snapshot.run({ segment: 2, offset: 3 }, { b: { y: 2 } });

        const loaded = await snapshot.load();
        expect(loaded!.commitId).deep.equal({ segment: 2, offset: 3 });
        expect(loaded!.data["b"].y).equal(2);
        // Old data should be gone
        expect(loaded!.data["a"]).equal(undefined);
    });

    describe("compression", () => {
        it("writes and loads a compressed snapshot", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const snapshot = new WalSnapshot(storageDir, true);

            const commitId = { segment: 1, offset: 5 };
            const data = {
                "ctx.sub": { key1: "value1", key2: 42 },
                other: { flag: true },
            };

            await snapshot.run(commitId, data);

            // Should have written .json.gz, not .json
            expect(await storageDir.file("snapshot.json.gz").exists()).equal(true);
            expect(await storageDir.file("snapshot.json").exists()).equal(false);

            const loaded = await snapshot.load();
            expect(loaded).not.equal(undefined);
            expect(loaded!.commitId).deep.equal(commitId);
            expect(loaded!.data["ctx.sub"].key1).equal("value1");
            expect(loaded!.data["ctx.sub"].key2).equal(42);
            expect(loaded!.data["other"].flag).equal(true);
        });

        it("auto-detects uncompressed snapshot when compression enabled", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            // Write uncompressed
            const writer = new WalSnapshot(storageDir, false);
            await writer.run({ segment: 1, offset: 0 }, { ctx: { key: "uncompressed" } });

            // Read with compression enabled — should auto-detect .json
            const reader = new WalSnapshot(storageDir, true);
            const loaded = await reader.load();
            expect(loaded).not.equal(undefined);
            expect(loaded!.data["ctx"].key).equal("uncompressed");
        });

        it("auto-detects compressed snapshot when compression disabled", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            // Write compressed
            const writer = new WalSnapshot(storageDir, true);
            await writer.run({ segment: 1, offset: 0 }, { ctx: { key: "compressed" } });

            // Read with compression disabled — should auto-detect .json.gz
            const reader = new WalSnapshot(storageDir, false);
            const loaded = await reader.load();
            expect(loaded).not.equal(undefined);
            expect(loaded!.data["ctx"].key).equal("compressed");
        });

        it("deletes old-format file when switching to compressed", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            // Write uncompressed
            const uncompressed = new WalSnapshot(storageDir, false);
            await uncompressed.run({ segment: 1, offset: 0 }, { ctx: { key: "v1" } });
            expect(await storageDir.file("snapshot.json").exists()).equal(true);

            // Switch to compressed
            const compressed = new WalSnapshot(storageDir, true);
            await compressed.run({ segment: 2, offset: 0 }, { ctx: { key: "v2" } });

            expect(await storageDir.file("snapshot.json.gz").exists()).equal(true);
            expect(await storageDir.file("snapshot.json").exists()).equal(false);
        });

        it("deletes old-format file when switching to uncompressed", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            // Write compressed
            const compressed = new WalSnapshot(storageDir, true);
            await compressed.run({ segment: 1, offset: 0 }, { ctx: { key: "v1" } });
            expect(await storageDir.file("snapshot.json.gz").exists()).equal(true);

            // Switch to uncompressed
            const uncompressed = new WalSnapshot(storageDir, false);
            await uncompressed.run({ segment: 2, offset: 0 }, { ctx: { key: "v2" } });

            expect(await storageDir.file("snapshot.json").exists()).equal(true);
            expect(await storageDir.file("snapshot.json.gz").exists()).equal(false);
        });

        it("prefers newer .json.gz when both files exist", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();

            // Write uncompressed first (older mtime)
            const uncompressed = new WalSnapshot(storageDir, false);
            await uncompressed.run({ segment: 1, offset: 0 }, { ctx: { key: "old" } });

            // Write compressed second (newer mtime)
            const compressed = new WalSnapshot(storageDir, true);
            await compressed.run({ segment: 2, offset: 0 }, { ctx: { key: "new" } });

            // Both files exist — should prefer the newer .json.gz
            const reader = new WalSnapshot(storageDir, false);
            const loaded = await reader.load();
            expect(loaded).not.equal(undefined);
            expect(loaded!.data["ctx"].key).equal("new");
            expect(loaded!.commitId).deep.equal({ segment: 2, offset: 0 });
        });

        it("roundtrips special storage types through compressed snapshot", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const snapshot = new WalSnapshot(storageDir, true);

            const commitId = { segment: 3, offset: 7 };
            const data = {
                "ctx.special": {
                    bigint: BigInt("123456789012345678"),
                    buffer: new Uint8Array([1, 2, 3]).buffer,
                    nested: { a: [1, "two", true] },
                },
            };

            await snapshot.run(commitId, data as any);

            const loaded = await snapshot.load();
            expect(loaded).not.equal(undefined);
            expect(loaded!.commitId).deep.equal(commitId);
            expect(loaded!.data["ctx.special"].bigint).equal(BigInt("123456789012345678"));
            expect(loaded!.data["ctx.special"].nested).deep.equal({ a: [1, "two", true] });
        });
    });
});
