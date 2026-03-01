/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockFilesystem } from "#fs/MockFilesystem.js";
import { WalCleaner } from "#storage/wal/WalCleaner.js";
import { segmentFilename, serializeCommit, type WalCommit } from "#storage/wal/WalCommit.js";
import { WalReader } from "#storage/wal/WalReader.js";
import { WalSnapshot } from "#storage/wal/WalSnapshot.js";

describe("WalCleaner", () => {
    let fs: MockFilesystem;

    beforeEach(() => {
        fs = new MockFilesystem();
    });

    it("does nothing when wal directory does not exist", async () => {
        const walDir = fs.directory("wal");
        const cleaner = new WalCleaner(walDir);
        // Should not throw
        await cleaner.run({ segment: 5, offset: 0 });
    });

    it("deletes segments before the snapshot segment", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();
        await walDir.file(segmentFilename(1)).write("data\n");
        await walDir.file(segmentFilename(2)).write("data\n");
        await walDir.file(segmentFilename(3)).write("data\n");

        const cleaner = new WalCleaner(walDir);
        await cleaner.run({ segment: 3, offset: 0 });

        expect(await walDir.file(segmentFilename(1)).exists()).equal(false);
        expect(await walDir.file(segmentFilename(2)).exists()).equal(false);
        // Segment 3 should still exist (it's the snapshot's segment)
        expect(await walDir.file(segmentFilename(3)).exists()).equal(true);
    });

    it("keeps all segments when snapshot is at segment 1", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();
        await walDir.file(segmentFilename(1)).write("data\n");
        await walDir.file(segmentFilename(2)).write("data\n");

        const cleaner = new WalCleaner(walDir);
        await cleaner.run({ segment: 1, offset: 5 });

        expect(await walDir.file(segmentFilename(1)).exists()).equal(true);
        expect(await walDir.file(segmentFilename(2)).exists()).equal(true);
    });

    it("ignores non-segment files", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();
        await walDir.file(segmentFilename(1)).write("data\n");
        await walDir.file("readme.txt").write("do not delete");

        const cleaner = new WalCleaner(walDir);
        await cleaner.run({ segment: 5, offset: 0 });

        expect(await walDir.file(segmentFilename(1)).exists()).equal(false);
        expect(await walDir.file("readme.txt").exists()).equal(true);
    });

    describe("head snapshot", () => {
        it("builds head snapshot from segments before deletion", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const walDir = storageDir.directory("wal");
            await walDir.mkdir();

            // Segment 1: set ctx.key1 = "a"
            const commit1: WalCommit = { ts: 1000, ops: [{ op: "upd", key: "ctx", values: { key1: "a" } }] };
            await walDir.file(segmentFilename(1)).write(serializeCommit(commit1) + "\n");

            // Segment 2: set ctx.key2 = "b"
            const commit2: WalCommit = { ts: 2000, ops: [{ op: "upd", key: "ctx", values: { key2: "b" } }] };
            await walDir.file(segmentFilename(2)).write(serializeCommit(commit2) + "\n");

            // Segment 3: set ctx.key3 = "c" (this segment is kept — it's the snapshot segment)
            const commit3: WalCommit = { ts: 3000, ops: [{ op: "upd", key: "ctx", values: { key3: "c" } }] };
            await walDir.file(segmentFilename(3)).write(serializeCommit(commit3) + "\n");

            const reader = new WalReader(walDir);
            const cleaner = new WalCleaner(walDir, { dir: storageDir, compress: false, reader });

            await cleaner.run({ segment: 3, offset: 0 });

            // Segments 1 and 2 should be deleted
            expect(await walDir.file(segmentFilename(1)).exists()).equal(false);
            expect(await walDir.file(segmentFilename(2)).exists()).equal(false);
            expect(await walDir.file(segmentFilename(3)).exists()).equal(true);

            // Head snapshot should exist with state from segments 1 and 2 only
            const loaded = await WalSnapshot.load(storageDir, { basename: "head" });
            expect(loaded).not.equal(undefined);
            expect(loaded!.data["ctx"].key1).equal("a");
            expect(loaded!.data["ctx"].key2).equal("b");
            expect(loaded!.data["ctx"].key3).equal(undefined);
        });

        it("accumulates state across multiple clean runs", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const walDir = storageDir.directory("wal");
            await walDir.mkdir();

            // Segment 1: set ctx.key1 = "a"
            const commit1: WalCommit = { ts: 1000, ops: [{ op: "upd", key: "ctx", values: { key1: "a" } }] };
            await walDir.file(segmentFilename(1)).write(serializeCommit(commit1) + "\n");

            // Segment 2: set ctx.key2 = "b"
            const commit2: WalCommit = { ts: 2000, ops: [{ op: "upd", key: "ctx", values: { key2: "b" } }] };
            await walDir.file(segmentFilename(2)).write(serializeCommit(commit2) + "\n");

            const reader = new WalReader(walDir);
            const cleaner = new WalCleaner(walDir, { dir: storageDir, compress: false, reader });

            // First clean: delete segment 1
            await cleaner.run({ segment: 2, offset: 0 });
            expect(await walDir.file(segmentFilename(1)).exists()).equal(false);

            // Add segment 3
            const commit3: WalCommit = { ts: 3000, ops: [{ op: "upd", key: "ctx", values: { key3: "c" } }] };
            await walDir.file(segmentFilename(3)).write(serializeCommit(commit3) + "\n");

            // Second clean: delete segment 2
            await cleaner.run({ segment: 3, offset: 0 });
            expect(await walDir.file(segmentFilename(2)).exists()).equal(false);

            // Head snapshot should have accumulated state from segments 1 and 2
            const loaded = await WalSnapshot.load(storageDir, { basename: "head" });
            expect(loaded).not.equal(undefined);
            expect(loaded!.data["ctx"].key1).equal("a");
            expect(loaded!.data["ctx"].key2).equal("b");
            expect(loaded!.data["ctx"].key3).equal(undefined);
        });

        it("does not build head snapshot when no segments to delete", async () => {
            const storageDir = fs.directory("storage");
            await storageDir.mkdir();
            const walDir = storageDir.directory("wal");
            await walDir.mkdir();

            await walDir.file(segmentFilename(1)).write("data\n");

            const reader = new WalReader(walDir);
            const cleaner = new WalCleaner(walDir, { dir: storageDir, compress: false, reader });

            await cleaner.run({ segment: 1, offset: 0 });

            // No segments deleted, so no head snapshot
            expect(await storageDir.file("head.json").exists()).equal(false);
        });
    });
});
