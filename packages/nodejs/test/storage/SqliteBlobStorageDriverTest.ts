/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SqliteBlobStorageDriver } from "#storage/sqlite/SqliteBlobStorageDriver.js";
import { supportsSqlite } from "#util/runtimeChecks.js";
import { Bytes } from "@matter/general";
import * as assert from "node:assert";

if (supportsSqlite()) {
    describe("SqliteBlobStorageDriver", () => {
        let storage: SqliteBlobStorageDriver;

        beforeEach(async () => {
            storage = new SqliteBlobStorageDriver({ namespaceOrPath: ":memory:" });
            await storage.initialize();
        });

        afterEach(() => {
            if (storage.initialized) {
                storage.close();
            }
        });

        function makeStream(data: Uint8Array): ReadableStream<Bytes> {
            return new ReadableStream({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });
        }

        it("writeBlobFromStream and openBlob round-trip", async () => {
            const data = new Uint8Array([1, 2, 3, 4, 5]);
            await storage.writeBlobFromStream(["ctx"], "blob1", makeStream(data));

            const blob = storage.openBlob(["ctx"], "blob1");
            const result = new Uint8Array(await blob.arrayBuffer());
            assert.deepStrictEqual(result, data);
        });

        it("openBlob returns empty Blob for missing key", () => {
            const blob = storage.openBlob(["ctx"], "nonexistent");
            assert.strictEqual(blob.size, 0);
        });

        it("has returns true for existing and false for missing", async () => {
            assert.strictEqual(storage.has(["ctx"], "key1"), false);

            const data = new Uint8Array([10, 20]);
            await storage.writeBlobFromStream(["ctx"], "key1", makeStream(data));

            assert.strictEqual(storage.has(["ctx"], "key1"), true);
        });

        it("keys lists blob keys for a context", async () => {
            await storage.writeBlobFromStream(["ctx"], "a", makeStream(new Uint8Array([1])));
            await storage.writeBlobFromStream(["ctx"], "b", makeStream(new Uint8Array([2])));
            await storage.writeBlobFromStream(["other"], "c", makeStream(new Uint8Array([3])));

            const keys = storage.keys(["ctx"]);
            assert.deepStrictEqual(keys.sort(), ["a", "b"]);
        });

        it("delete removes a blob", async () => {
            const data = new Uint8Array([42]);
            await storage.writeBlobFromStream(["ctx"], "key1", makeStream(data));
            assert.strictEqual(storage.has(["ctx"], "key1"), true);

            storage.delete(["ctx"], "key1");
            assert.strictEqual(storage.has(["ctx"], "key1"), false);

            const blob = storage.openBlob(["ctx"], "key1");
            assert.strictEqual(blob.size, 0);
        });

        it("contexts lists sub-contexts", async () => {
            await storage.writeBlobFromStream(["root", "sub1"], "k", makeStream(new Uint8Array([1])));
            await storage.writeBlobFromStream(["root", "sub2"], "k", makeStream(new Uint8Array([2])));
            await storage.writeBlobFromStream(["root", "sub2", "deep"], "k", makeStream(new Uint8Array([3])));

            const ctxs = storage.contexts(["root"]);
            assert.deepStrictEqual(ctxs.sort(), ["sub1", "sub2"]);
        });

        it("contexts from root lists top-level contexts", async () => {
            await storage.writeBlobFromStream(["alpha"], "k", makeStream(new Uint8Array([1])));
            await storage.writeBlobFromStream(["beta", "child"], "k", makeStream(new Uint8Array([2])));

            const ctxs = storage.contexts([]);
            assert.deepStrictEqual(ctxs.sort(), ["alpha", "beta"]);
        });

        it("clearAll removes all blobs in context and sub-contexts", async () => {
            await storage.writeBlobFromStream(["ctx"], "k1", makeStream(new Uint8Array([1])));
            await storage.writeBlobFromStream(["ctx", "sub"], "k2", makeStream(new Uint8Array([2])));
            await storage.writeBlobFromStream(["ctx", "sub", "deep"], "k3", makeStream(new Uint8Array([3])));
            await storage.writeBlobFromStream(["other"], "k4", makeStream(new Uint8Array([4])));

            storage.clearAll(["ctx"]);

            assert.strictEqual(storage.has(["ctx"], "k1"), false);
            assert.strictEqual(storage.has(["ctx", "sub"], "k2"), false);
            assert.strictEqual(storage.has(["ctx", "sub", "deep"], "k3"), false);
            // other context untouched
            assert.strictEqual(storage.has(["other"], "k4"), true);
        });

        it("blob size is correct", async () => {
            const data = new Uint8Array(1024);
            for (let i = 0; i < data.length; i++) {
                data[i] = i % 256;
            }
            await storage.writeBlobFromStream(["ctx"], "large", makeStream(data));

            const blob = storage.openBlob(["ctx"], "large");
            assert.strictEqual(blob.size, 1024);

            const result = new Uint8Array(await blob.arrayBuffer());
            assert.deepStrictEqual(result, data);
        });

        it("writeBlobFromStream overwrites existing blob", async () => {
            await storage.writeBlobFromStream(["ctx"], "key", makeStream(new Uint8Array([1, 2, 3])));
            await storage.writeBlobFromStream(["ctx"], "key", makeStream(new Uint8Array([4, 5])));

            const blob = storage.openBlob(["ctx"], "key");
            const result = new Uint8Array(await blob.arrayBuffer());
            assert.deepStrictEqual(result, new Uint8Array([4, 5]));
        });
    });
}
