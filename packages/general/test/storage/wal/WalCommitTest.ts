/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    type WalCommit,
    type WalCommitId,
    commitIdToNumber,
    compareCommitIds,
    decodeContextKey,
    deserializeCommit,
    encodeContextKey,
    parseSegmentFilename,
    segmentFilename,
    serializeCommit,
} from "#storage/wal/WalCommit.js";

describe("WalCommit", () => {
    describe("encodeContextKey / decodeContextKey", () => {
        it("encodes simple contexts", () => {
            expect(encodeContextKey(["a", "b", "c"])).equal("a/b/c");
        });

        it("encodes contexts with slashes", () => {
            expect(encodeContextKey(["a/b", "c"])).equal("a%2Fb/c");
        });

        it("encodes contexts with percent signs", () => {
            expect(encodeContextKey(["a%b", "c"])).equal("a%25b/c");
        });

        it("roundtrips", () => {
            const original = ["hello/world", "foo%bar", "plain"];
            const encoded = encodeContextKey(original);
            const decoded = decodeContextKey(encoded);
            expect(decoded).deep.equal(original);
        });

        it("handles single context", () => {
            expect(encodeContextKey(["only"])).equal("only");
            expect(decodeContextKey("only")).deep.equal(["only"]);
        });
    });

    describe("serializeCommit / deserializeCommit", () => {
        it("roundtrips an update op", () => {
            const commit: WalCommit = {
                ts: 1000,
                ops: [{ op: "upd", key: "ctx.sub", values: { foo: "bar", num: 42 } }],
            };
            const line = serializeCommit(commit);
            const result = deserializeCommit(line);
            expect(result).deep.equal(commit);
        });

        it("roundtrips a delete op with values", () => {
            const commit: WalCommit = { ts: 2000, ops: [{ op: "del", key: "ctx.sub", values: ["a", "b"] }] };
            const line = serializeCommit(commit);
            const result = deserializeCommit(line);
            expect(result).deep.equal(commit);
        });

        it("roundtrips a delete op without values (subtree clear)", () => {
            const commit: WalCommit = { ts: 3000, ops: [{ op: "del", key: "ctx" }] };
            const line = serializeCommit(commit);
            const result = deserializeCommit(line);
            expect(result).deep.equal(commit);
        });

        it("roundtrips multiple ops", () => {
            const commit: WalCommit = {
                ts: 4000,
                ops: [
                    { op: "upd", key: "a", values: { x: 1 } },
                    { op: "del", key: "b", values: ["y"] },
                ],
            };
            const line = serializeCommit(commit);
            const result = deserializeCommit(line);
            expect(result).deep.equal(commit);
        });

        it("preserves ts through roundtrip", () => {
            const commit: WalCommit = { ts: 1709312400000, ops: [{ op: "upd", key: "a", values: { x: 1 } }] };
            const line = serializeCommit(commit);
            const result = deserializeCommit(line);
            expect(result.ts).equal(1709312400000);
            expect(result.ops).deep.equal(commit.ops);
        });

        it("deserializes legacy bare-array format", () => {
            const legacyLine = '[{"op":"upd","key":"a","values":{"x":1}}]';
            const result = deserializeCommit(legacyLine);
            expect(result.ts).equal(0);
            expect(result.ops).deep.equal([{ op: "upd", key: "a", values: { x: 1 } }]);
        });
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

    describe("commitIdToNumber", () => {
        it("combines segment and offset", () => {
            const id: WalCommitId = { segment: 1, offset: 0 };
            expect(commitIdToNumber(id)).equal(0x10000);
        });

        it("includes offset in low 16 bits", () => {
            const id: WalCommitId = { segment: 1, offset: 5 };
            expect(commitIdToNumber(id)).equal(0x10005);
        });

        it("orders correctly across segments", () => {
            expect(commitIdToNumber({ segment: 1, offset: 0xffff })).lessThan(
                commitIdToNumber({ segment: 2, offset: 0 }),
            );
        });
    });

    describe("compareCommitIds", () => {
        it("equal IDs", () => {
            expect(compareCommitIds({ segment: 1, offset: 5 }, { segment: 1, offset: 5 })).equal(0);
        });

        it("different segments", () => {
            expect(compareCommitIds({ segment: 1, offset: 5 }, { segment: 2, offset: 0 })).lessThan(0);
            expect(compareCommitIds({ segment: 3, offset: 0 }, { segment: 2, offset: 5 })).greaterThan(0);
        });

        it("same segment different offsets", () => {
            expect(compareCommitIds({ segment: 1, offset: 3 }, { segment: 1, offset: 7 })).lessThan(0);
            expect(compareCommitIds({ segment: 1, offset: 7 }, { segment: 1, offset: 3 })).greaterThan(0);
        });
    });
});
