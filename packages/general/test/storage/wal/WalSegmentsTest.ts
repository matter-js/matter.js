/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockFilesystem } from "#fs/MockFilesystem.js";
import { StorageError } from "#storage/StorageDriver.js";
import {
    compressedSegmentFilename,
    deleteSegmentsBefore,
    compressSegmentsBefore,
    listSegments,
    parseSegmentFilename,
    segmentFilename,
} from "#storage/wal/WalSegments.js";

describe("WalSegments", () => {
    let fs: MockFilesystem;

    beforeEach(() => {
        fs = new MockFilesystem();
    });

    it("does nothing when wal directory does not exist", async () => {
        const walDir = fs.directory("wal");
        await deleteSegmentsBefore(walDir, 5);
    });

    it("deletes segments before the given segment", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();
        await walDir.file(segmentFilename(1)).write("data\n");
        await walDir.file(segmentFilename(2)).write("data\n");
        await walDir.file(segmentFilename(3)).write("data\n");

        await deleteSegmentsBefore(walDir, 3);

        expect(await walDir.file(segmentFilename(1)).exists()).equal(false);
        expect(await walDir.file(segmentFilename(2)).exists()).equal(false);
        expect(await walDir.file(segmentFilename(3)).exists()).equal(true);
    });

    it("keeps all segments when the given segment is 1", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();
        await walDir.file(segmentFilename(1)).write("data\n");
        await walDir.file(segmentFilename(2)).write("data\n");

        await deleteSegmentsBefore(walDir, 1);

        expect(await walDir.file(segmentFilename(1)).exists()).equal(true);
        expect(await walDir.file(segmentFilename(2)).exists()).equal(true);
    });

    it("ignores non-segment files", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();
        await walDir.file(segmentFilename(1)).write("data\n");
        await walDir.file("readme.txt").write("do not delete");

        await deleteSegmentsBefore(walDir, 5);

        expect(await walDir.file(segmentFilename(1)).exists()).equal(false);
        expect(await walDir.file("readme.txt").exists()).equal(true);
    });

    it("deletes the temporary file a compression left for a deleted segment", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();
        await walDir.file(segmentFilename(1)).write("data\n");
        await walDir.file(`${compressedSegmentFilename(1)}.tmp`).write("partial");

        await deleteSegmentsBefore(walDir, 2);

        expect(await walDir.file(`${compressedSegmentFilename(1)}.tmp`).exists()).equal(false);
    });

    it("lists the files of each segment in segment order", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();
        await walDir.file(segmentFilename(3)).write("data\n");
        await walDir.file(compressedSegmentFilename(1)).write("data");
        await walDir.file(segmentFilename(1)).write("data\n");
        await walDir.file("readme.txt").write("not a segment");
        await walDir.directory(segmentFilename(4)).mkdir();

        expect(await listSegments(walDir)).deep.equal([
            { segment: 1, compressed: compressedSegmentFilename(1), original: segmentFilename(1) },
            { segment: 3, original: segmentFilename(3) },
        ]);
    });

    it("compresses the remaining segments when one segment fails", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();
        await walDir.file(segmentFilename(1)).write("one\n");
        await walDir.file(segmentFilename(2)).write("two\n");
        using _failingSegment1 = fs.intercept((operation, path) => {
            if (operation === "open" && path.endsWith(`${compressedSegmentFilename(1)}.tmp`)) {
                throw new StorageError("disk failure");
            }
        });

        await compressSegmentsBefore(walDir, 3, { fsync: false });

        expect(await walDir.file(segmentFilename(1)).exists()).equal(true);
        expect(await walDir.file(compressedSegmentFilename(2)).exists()).equal(true);
        expect(await walDir.file(segmentFilename(2)).exists()).equal(false);
    });

    describe("segmentFilename / parseSegmentFilename", () => {
        it("formats segment number", () => {
            expect(segmentFilename(1)).equal("00000001.jsonl");
            expect(segmentFilename(255)).equal("000000ff.jsonl");
            expect(segmentFilename(0xabcdef12)).equal("abcdef12.jsonl");
        });

        it("parses segment filename", () => {
            expect(parseSegmentFilename("00000001.jsonl")).equal(1);
            expect(parseSegmentFilename("000000ff.jsonl")).equal(255);
        });

        it("returns undefined for invalid filenames", () => {
            expect(parseSegmentFilename("not-a-segment.txt")).equal(undefined);
            expect(parseSegmentFilename("001.jsonl")).equal(undefined);
        });
    });
});
