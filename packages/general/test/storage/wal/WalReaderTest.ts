/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MockFilesystem } from "#fs/MockFilesystem.js";
import { type WalCommit, type WalCommitId, segmentFilename, serializeCommit } from "#storage/wal/WalCommit.js";
import { WalReader } from "#storage/wal/WalReader.js";

async function collectAll(iter: AsyncIterable<{ id: WalCommitId; commit: WalCommit }>) {
    const results: { id: WalCommitId; commit: WalCommit }[] = [];
    for await (const entry of iter) {
        results.push(entry);
    }
    return results;
}

describe("WalReader", () => {
    let fs: MockFilesystem;

    beforeEach(() => {
        fs = new MockFilesystem();
    });

    it("returns empty when no WAL directory exists", async () => {
        const reader = new WalReader(fs.directory("wal"));
        const results = await collectAll(reader.read());
        expect(results).deep.equal([]);
    });

    it("returns empty when WAL directory is empty", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();
        const reader = new WalReader(walDir);
        const results = await collectAll(reader.read());
        expect(results).deep.equal([]);
    });

    it("reads commits from a single segment", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();

        const commit1: WalCommit = { ts: 1000, ops: [{ op: "upd", key: "a", values: { x: 1 } }] };
        const commit2: WalCommit = { ts: 2000, ops: [{ op: "del", key: "b", values: ["y"] }] };
        const content = serializeCommit(commit1) + "\n" + serializeCommit(commit2) + "\n";
        await walDir.file(segmentFilename(1)).write(content);

        const reader = new WalReader(walDir);
        const results = await collectAll(reader.read());

        expect(results.length).equal(2);
        expect(results[0].id).deep.equal({ segment: 1, offset: 0 });
        expect(results[0].commit).deep.equal(commit1);
        expect(results[1].id).deep.equal({ segment: 1, offset: 1 });
        expect(results[1].commit).deep.equal(commit2);
    });

    it("reads commits across multiple segments", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();

        const commit1: WalCommit = { ts: 1000, ops: [{ op: "upd", key: "a", values: { x: 1 } }] };
        const commit2: WalCommit = { ts: 2000, ops: [{ op: "upd", key: "b", values: { y: 2 } }] };
        await walDir.file(segmentFilename(1)).write(serializeCommit(commit1) + "\n");
        await walDir.file(segmentFilename(2)).write(serializeCommit(commit2) + "\n");

        const reader = new WalReader(walDir);
        const results = await collectAll(reader.read());

        expect(results.length).equal(2);
        expect(results[0].id).deep.equal({ segment: 1, offset: 0 });
        expect(results[1].id).deep.equal({ segment: 2, offset: 0 });
    });

    it("reads commits after a given commit ID", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();

        const commit1: WalCommit = { ts: 1000, ops: [{ op: "upd", key: "a", values: { x: 1 } }] };
        const commit2: WalCommit = { ts: 2000, ops: [{ op: "upd", key: "b", values: { y: 2 } }] };
        const commit3: WalCommit = { ts: 3000, ops: [{ op: "upd", key: "c", values: { z: 3 } }] };
        const content =
            serializeCommit(commit1) + "\n" + serializeCommit(commit2) + "\n" + serializeCommit(commit3) + "\n";
        await walDir.file(segmentFilename(1)).write(content);

        const reader = new WalReader(walDir);
        const results = await collectAll(reader.read({ segment: 1, offset: 0 }));

        expect(results.length).equal(2);
        expect(results[0].id).deep.equal({ segment: 1, offset: 1 });
        expect(results[0].commit).deep.equal(commit2);
        expect(results[1].id).deep.equal({ segment: 1, offset: 2 });
    });

    it("skips earlier segments when reading after a commit", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();

        const commit1: WalCommit = { ts: 1000, ops: [{ op: "upd", key: "a", values: { x: 1 } }] };
        const commit2: WalCommit = { ts: 2000, ops: [{ op: "upd", key: "b", values: { y: 2 } }] };
        await walDir.file(segmentFilename(1)).write(serializeCommit(commit1) + "\n");
        await walDir.file(segmentFilename(2)).write(serializeCommit(commit2) + "\n");

        const reader = new WalReader(walDir);
        const results = await collectAll(reader.read({ segment: 1, offset: 0 }));

        expect(results.length).equal(1);
        expect(results[0].id).deep.equal({ segment: 2, offset: 0 });
    });

    it("handles malformed lines gracefully", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();

        const commit1: WalCommit = { ts: 1000, ops: [{ op: "upd", key: "a", values: { x: 1 } }] };
        const content = serializeCommit(commit1) + "\n" + "NOT VALID JSON{{{" + "\n";
        await walDir.file(segmentFilename(1)).write(content);

        const reader = new WalReader(walDir);
        const results = await collectAll(reader.read());

        // Should have the valid commit, skipping the malformed one
        expect(results.length).equal(1);
        expect(results[0].commit).deep.equal(commit1);
    });

    it("lists segments sorted", async () => {
        const walDir = fs.directory("wal");
        await walDir.mkdir();
        await walDir.file(segmentFilename(3)).write("");
        await walDir.file(segmentFilename(1)).write("");
        await walDir.file(segmentFilename(2)).write("");

        const reader = new WalReader(walDir);
        const segments = await reader.segments();
        expect(segments).deep.equal([1, 2, 3]);
    });
});
