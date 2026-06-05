/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SqliteStorageDriverError } from "#storage/sqlite/SqliteStorageDriverError.js";
import {
    buildContextKeyLog,
    buildContextKeyPair,
    buildContextPath,
    buildKey,
    escapeGlob,
} from "#storage/sqlite/SqliteUtil.js";

describe("SqliteUtil", () => {
    describe("buildContextPath", () => {
        it("joins contexts with dots", () => {
            expect(buildContextPath(["a", "b", "c"])).equal("a.b.c");
        });

        it("returns empty string for no contexts", () => {
            expect(buildContextPath([])).equal("");
        });

        it("rejects empty segments", () => {
            expect(() => buildContextPath(["a", " "])).throws(SqliteStorageDriverError);
        });

        it("rejects segments containing dots", () => {
            expect(() => buildContextPath(["a.b"])).throws(SqliteStorageDriverError);
        });
    });

    describe("buildKey", () => {
        it("passes a non-empty key through", () => {
            expect(buildKey("key")).equal("key");
        });

        it("rejects an empty key", () => {
            expect(() => buildKey("  ")).throws(SqliteStorageDriverError);
        });
    });

    describe("buildContextKeyPair", () => {
        it("builds a context/key pair", () => {
            expect(buildContextKeyPair(["a", "b"], "k")).deep.equal({ context: "a.b", key: "k" });
        });
    });

    describe("buildContextKeyLog", () => {
        it("joins context and key with a dollar sign", () => {
            expect(buildContextKeyLog(["a", "b"], "k")).equal("a.b$k");
        });
    });

    describe("escapeGlob", () => {
        it("escapes glob metacharacters", () => {
            expect(escapeGlob("a*b")).equal("a[*]b");
            expect(escapeGlob("a?b")).equal("a[?]b");
            expect(escapeGlob("a[b")).equal("a[[]b");
        });

        it("leaves ordinary strings unchanged", () => {
            expect(escapeGlob("plain")).equal("plain");
        });
    });
});
