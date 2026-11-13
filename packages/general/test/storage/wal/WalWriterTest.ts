/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockFilesystem } from "#fs/MockFilesystem.js";
import { StorageError } from "#storage/StorageDriver.js";
import { type WalOp, deserializeCommit } from "#storage/wal/WalCommit.js";
import { segmentFilename } from "#storage/wal/WalSegments.js";
import { WalWriter } from "#storage/wal/WalWriter.js";

describe("WalWriter", () => {
    let fs: MockFilesystem;

    beforeEach(() => {
        fs = new MockFilesystem();
    });

    it("writes a single commit", async () => {
        const walDir = fs.directory("wal");
        const writer = new WalWriter(walDir, { fsync: false, firstSegment: 1 });

        const ops: WalOp[] = [{ op: "upd", key: "a", values: { x: 1 } }];
        const result = await writer.write(ops);
        await writer.close();

        expect(result.id).deep.equal({ segment: 1, offset: 0 });
        expect(result.ts).greaterThan(0);

        const file = walDir.file(segmentFilename(1));
        const text = await file.readAllText();
        const lines = text.split("\n").filter(l => l.length > 0);
        expect(lines.length).equal(1);

        const commit = deserializeCommit(lines[0]);
        expect(commit.ops).deep.equal(ops);
        expect(commit.ts).greaterThan(0);
    });

    it("writes multiple commits to the same segment", async () => {
        const walDir = fs.directory("wal");
        const writer = new WalWriter(walDir, { fsync: false, firstSegment: 1 });

        const ops1: WalOp[] = [{ op: "upd", key: "a", values: { x: 1 } }];
        const ops2: WalOp[] = [{ op: "upd", key: "b", values: { y: 2 } }];

        const r1 = await writer.write(ops1);
        const r2 = await writer.write(ops2);
        await writer.close();

        expect(r1.id).deep.equal({ segment: 1, offset: 0 });
        expect(r2.id).deep.equal({ segment: 1, offset: 1 });

        const file = walDir.file(segmentFilename(1));
        const text = await file.readAllText();
        const lines = text.split("\n").filter(l => l.length > 0);
        expect(lines.length).equal(2);
    });

    it("rotates segment on size threshold", async () => {
        const walDir = fs.directory("wal");
        // Very small max size to force rotation
        const writer = new WalWriter(walDir, { fsync: false, maxSegmentSize: 10, firstSegment: 1 });

        const ops1: WalOp[] = [{ op: "upd", key: "a", values: { x: "hello world this is a long value" } }];
        const ops2: WalOp[] = [{ op: "upd", key: "b", values: { y: "another value" } }];

        const r1 = await writer.write(ops1);
        const r2 = await writer.write(ops2);
        await writer.close();

        // First commit goes to segment 1, second should trigger rotation to segment 2
        expect(r1.id.segment).equal(1);
        expect(r2.id.segment).equal(2);
    });

    it("starts at the given first segment", async () => {
        const walDir = fs.directory("wal");

        const writer = new WalWriter(walDir, { fsync: false, firstSegment: 8 });
        const result = await writer.write([{ op: "upd", key: "a", values: { x: 1 } }]);
        await writer.close();

        expect(result.id).deep.equal({ segment: 8, offset: 0 });
    });

    it("starts a new segment after a failed write", async () => {
        const walDir = fs.directory("wal");
        const writer = new WalWriter(walDir, { fsync: true, firstSegment: 1 });
        await writer.write([{ op: "upd", key: "a", values: { x: 1 } }]);

        {
            using _failingFsync = fs.intercept(operation => {
                if (operation === "fsync") {
                    throw new StorageError("disk failure");
                }
            });
            await expect(writer.write([{ op: "upd", key: "b", values: { y: 2 } }])).rejectedWith("disk failure");
        }

        const result = await writer.write([{ op: "upd", key: "c", values: { z: 3 } }]);
        await writer.close();

        expect(result.id).deep.equal({ segment: 2, offset: 0 });
    });

    it("keeps writing after a failed segment open during rotation, without skipping a segment number", async () => {
        const walDir = fs.directory("wal");
        const writer = new WalWriter(walDir, { fsync: false, maxSegmentSize: 10, firstSegment: 1 });
        await writer.write([{ op: "upd", key: "a", values: { x: 1 } }]);

        {
            using _failingOpen = fs.intercept((operation, path) => {
                if (operation === "open" && path.endsWith(segmentFilename(2))) {
                    throw new StorageError("cannot open");
                }
            });
            await expect(writer.write([{ op: "upd", key: "b", values: { y: 2 } }])).rejectedWith("cannot open");
        }

        const result = await writer.write([{ op: "upd", key: "c", values: { z: 3 } }]);
        await writer.close();

        expect(result.id).deep.equal({ segment: 2, offset: 0 });
    });

    it("reports a failure to close the segment", async () => {
        const walDir = fs.directory("wal");
        const writer = new WalWriter(walDir, { fsync: false, firstSegment: 1 });
        await writer.write([{ op: "upd", key: "a", values: { x: 1 } }]);

        using _failingClose = fs.intercept(operation => {
            if (operation === "close") {
                throw new StorageError("close failed");
            }
        });
        await expect(writer.close()).rejectedWith("close failed");
    });

    it("serializes concurrent writes", async () => {
        const walDir = fs.directory("wal");
        const writer = new WalWriter(walDir, { fsync: false, firstSegment: 1 });

        // Fire 20 concurrent writes
        const count = 20;
        const promises = Array.from({ length: count }, (_, i) =>
            writer.write([{ op: "upd", key: `ctx`, values: { [`key${i}`]: i } }]),
        );
        const results = await Promise.all(promises);
        await writer.close();

        // Every commit should have a unique segment+offset
        const ids = results.map(r => `${r.id.segment}:${r.id.offset}`);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).equal(count);

        // Read back the segment and verify all commits landed
        const file = walDir.file(segmentFilename(1));
        const text = await file.readAllText();
        const lines = text.split("\n").filter(l => l.length > 0);
        expect(lines.length).equal(count);

        // Verify each line is valid JSON (no interleaving corruption)
        for (const line of lines) {
            const commit = deserializeCommit(line);
            expect(commit.ops.length).equal(1);
        }
    });

    it("creates wal directory if it does not exist", async () => {
        const walDir = fs.directory("wal");
        const writer = new WalWriter(walDir, { fsync: false, firstSegment: 1 });

        const ops: WalOp[] = [{ op: "upd", key: "a", values: { x: 1 } }];
        await writer.write(ops);
        await writer.close();

        expect(await walDir.exists()).equal(true);
    });
});
