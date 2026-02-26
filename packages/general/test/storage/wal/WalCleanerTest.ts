/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockFilesystem } from "#fs/MockFilesystem.js";
import { WalCleaner } from "#storage/wal/WalCleaner.js";
import { segmentFilename } from "#storage/wal/WalCommit.js";

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
});
