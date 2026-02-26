/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockFilesystem } from "#fs/MockFilesystem.js";
import { type WalCommit, deserializeCommit, segmentFilename } from "#storage/wal/WalCommit.js";
import { WalWriter } from "#storage/wal/WalWriter.js";

describe("WalWriter", () => {
    let fs: MockFilesystem;

    beforeEach(() => {
        fs = new MockFilesystem();
    });

    it("writes a single commit", async () => {
        const walDir = fs.directory("wal");
        const writer = new WalWriter(walDir, { fsync: false });

        const commit: WalCommit = [{ op: "upd", key: "a", values: { x: 1 } }];
        const id = await writer.write(commit);
        await writer.close();

        expect(id).deep.equal({ segment: 1, offset: 0 });

        const file = walDir.file(segmentFilename(1));
        const text = await file.readAllText();
        const lines = text.split("\n").filter(l => l.length > 0);
        expect(lines.length).equal(1);
        expect(deserializeCommit(lines[0])).deep.equal(commit);
    });

    it("writes multiple commits to the same segment", async () => {
        const walDir = fs.directory("wal");
        const writer = new WalWriter(walDir, { fsync: false });

        const commit1: WalCommit = [{ op: "upd", key: "a", values: { x: 1 } }];
        const commit2: WalCommit = [{ op: "upd", key: "b", values: { y: 2 } }];

        const id1 = await writer.write(commit1);
        const id2 = await writer.write(commit2);
        await writer.close();

        expect(id1).deep.equal({ segment: 1, offset: 0 });
        expect(id2).deep.equal({ segment: 1, offset: 1 });

        const file = walDir.file(segmentFilename(1));
        const text = await file.readAllText();
        const lines = text.split("\n").filter(l => l.length > 0);
        expect(lines.length).equal(2);
    });

    it("rotates segment on size threshold", async () => {
        const walDir = fs.directory("wal");
        // Very small max size to force rotation
        const writer = new WalWriter(walDir, { fsync: false, maxSegmentSize: 10 });

        const commit1: WalCommit = [{ op: "upd", key: "a", values: { x: "hello world this is a long value" } }];
        const commit2: WalCommit = [{ op: "upd", key: "b", values: { y: "another value" } }];

        const id1 = await writer.write(commit1);
        const id2 = await writer.write(commit2);
        await writer.close();

        // First commit goes to segment 1, second should trigger rotation to segment 2
        expect(id1.segment).equal(1);
        expect(id2.segment).equal(2);
    });

    it("resumes writing to existing segment", async () => {
        const walDir = fs.directory("wal");

        // Write one commit, then close
        const writer1 = new WalWriter(walDir, { fsync: false });
        const commit1: WalCommit = [{ op: "upd", key: "a", values: { x: 1 } }];
        await writer1.write(commit1);
        await writer1.close();

        // Open new writer, should continue from existing segment
        const writer2 = new WalWriter(walDir, { fsync: false });
        const commit2: WalCommit = [{ op: "upd", key: "b", values: { y: 2 } }];
        const id2 = await writer2.write(commit2);
        await writer2.close();

        expect(id2).deep.equal({ segment: 1, offset: 1 });

        const file = walDir.file(segmentFilename(1));
        const text = await file.readAllText();
        const lines = text.split("\n").filter(l => l.length > 0);
        expect(lines.length).equal(2);
    });

    it("creates wal directory if it does not exist", async () => {
        const walDir = fs.directory("wal");
        const writer = new WalWriter(walDir, { fsync: false });

        const commit: WalCommit = [{ op: "upd", key: "a", values: { x: 1 } }];
        await writer.write(commit);
        await writer.close();

        expect(await walDir.exists()).equal(true);
    });
});
