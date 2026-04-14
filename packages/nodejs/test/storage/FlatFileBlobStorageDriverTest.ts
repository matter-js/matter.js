/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FlatFileBlobStorageDriver } from "#storage/fs/FlatFileBlobStorageDriver.js";
import { Bytes, DatafileRoot } from "@matter/general";
import * as assert from "node:assert";
import { readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { NodeJsFilesystem } from "../../src/fs/NodeJsFilesystem.js";

const TEST_STORAGE_LOCATION = resolve(tmpdir(), "matterjs-test-flat-blob-storage");

function createStream(data: Uint8Array): ReadableStream<Bytes> {
    return new ReadableStream<Bytes>({
        start(controller) {
            controller.enqueue(data);
            controller.close();
        },
    });
}

describe("FlatFileBlobStorageDriver", () => {
    let driver: FlatFileBlobStorageDriver;
    let counter = 0;
    let currentPath: string;

    beforeEach(async () => {
        currentPath = resolve(TEST_STORAGE_LOCATION, `test_${++counter}`);
        const fs = new NodeJsFilesystem(currentPath);
        await fs.mkdir();
        const namespace = new DatafileRoot(fs);
        driver = FlatFileBlobStorageDriver.create(namespace, { kind: "file" });
        await driver.initialize();
    });

    afterEach(async () => {
        await driver?.close();
        await rm(currentPath, { recursive: true, force: true });
    });

    after(async () => {
        await rm(TEST_STORAGE_LOCATION, { recursive: true, force: true });
    });

    it("writeBlobFromStream and openBlob round-trip", async () => {
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        await driver.writeBlobFromStream(["ctx"], "myblob", createStream(data));

        const blob = await driver.openBlob(["ctx"], "myblob");
        const result = new Uint8Array(await blob.arrayBuffer());
        assert.deepEqual(result, data);
    });

    it("openBlob returns empty Blob for missing key", async () => {
        const blob = await driver.openBlob(["ctx"], "nonexistent");
        assert.equal(blob.size, 0);
    });

    it("has returns true for existing and false for missing key", async () => {
        assert.equal(await driver.has(["ctx"], "key"), false);

        await driver.writeBlobFromStream(["ctx"], "key", createStream(new Uint8Array([10])));

        assert.equal(await driver.has(["ctx"], "key"), true);
    });

    it("keys lists blob keys in a context", async () => {
        await driver.writeBlobFromStream(["ctx"], "a", createStream(new Uint8Array([1])));
        await driver.writeBlobFromStream(["ctx"], "b", createStream(new Uint8Array([2])));

        const k = await driver.keys(["ctx"]);
        assert.deepEqual(k.sort(), ["a", "b"]);
    });

    it("keys returns empty array for missing context", async () => {
        const k = await driver.keys(["nonexistent"]);
        assert.deepEqual(k, []);
    });

    it("delete removes a blob file", async () => {
        await driver.writeBlobFromStream(["ctx"], "key", createStream(new Uint8Array([1])));
        assert.equal(await driver.has(["ctx"], "key"), true);

        await driver.delete(["ctx"], "key");
        assert.equal(await driver.has(["ctx"], "key"), false);
    });

    it("delete is a no-op for missing key", async () => {
        // Should not throw
        await driver.delete(["ctx"], "nope");
    });

    it("contexts lists sub-contexts", async () => {
        await driver.writeBlobFromStream(["a", "b"], "key", createStream(new Uint8Array([1])));
        await driver.writeBlobFromStream(["a", "c"], "key", createStream(new Uint8Array([2])));

        const ctxs = await driver.contexts(["a"]);
        assert.deepEqual(ctxs.sort(), ["b", "c"]);
    });

    it("contexts returns empty array for missing path", async () => {
        const ctxs = await driver.contexts(["nonexistent"]);
        assert.deepEqual(ctxs, []);
    });

    it("clearAll removes all blobs matching context prefix", async () => {
        await driver.writeBlobFromStream(["a", "b"], "k1", createStream(new Uint8Array([1])));
        await driver.writeBlobFromStream(["a", "b", "c"], "k2", createStream(new Uint8Array([2])));
        await driver.writeBlobFromStream(["a"], "root", createStream(new Uint8Array([3])));

        await driver.clearAll(["a", "b"]);

        assert.equal(await driver.has(["a", "b"], "k1"), false);
        assert.equal(await driver.has(["a", "b", "c"], "k2"), false);
        // Root key under "a" should still exist
        assert.equal(await driver.has(["a"], "root"), true);
    });

    it("nested contexts work correctly", async () => {
        await driver.writeBlobFromStream(["l1", "l2", "l3"], "deep", createStream(new Uint8Array([42])));

        assert.equal(await driver.has(["l1", "l2", "l3"], "deep"), true);
        assert.deepEqual(await driver.contexts(["l1"]), ["l2"]);
        assert.deepEqual(await driver.contexts(["l1", "l2"]), ["l3"]);
        assert.deepEqual(await driver.keys(["l1", "l2", "l3"]), ["deep"]);
    });

    it("blob size is correct", async () => {
        const data = new Uint8Array([10, 20, 30, 40, 50]);
        await driver.writeBlobFromStream(["ctx"], "sized", createStream(data));

        const blob = await driver.openBlob(["ctx"], "sized");
        assert.equal(blob.size, 5);
    });

    it("files use flat naming convention", async () => {
        await driver.writeBlobFromStream(["bin", "fff1", "8000"], "prod", createStream(new Uint8Array([1])));

        const files = await readdir(currentPath);
        // The encoded filename should be bin.fff1.8000.prod (no subdirectories)
        assert.ok(
            files.includes("bin.fff1.8000.prod"),
            `Expected flat filename "bin.fff1.8000.prod" in ${JSON.stringify(files)}`,
        );
    });

    it("multi-chunk stream is combined correctly", async () => {
        const stream = new ReadableStream<Bytes>({
            start(controller) {
                controller.enqueue(new Uint8Array([1, 2]));
                controller.enqueue(new Uint8Array([3, 4]));
                controller.enqueue(new Uint8Array([5]));
                controller.close();
            },
        });

        await driver.writeBlobFromStream(["ctx"], "multi", stream);
        const blob = await driver.openBlob(["ctx"], "multi");
        const result = new Uint8Array(await blob.arrayBuffer());
        assert.deepEqual(result, new Uint8Array([1, 2, 3, 4, 5]));
    });

    it("special characters in context/key are encoded properly", async () => {
        // Characters that need URI encoding
        await driver.writeBlobFromStream(["a b"], "key", createStream(new Uint8Array([1])));

        assert.equal(await driver.has(["a b"], "key"), true);
        assert.deepEqual(await driver.keys(["a b"]), ["key"]);
        assert.deepEqual(await driver.contexts([]), ["a b"]);

        // Verify the actual filename is encoded
        const files = await readdir(currentPath);
        const encoded = files.find(f => f.includes("a%20b"));
        assert.ok(encoded, `Expected URI-encoded filename containing "a%20b" in ${JSON.stringify(files)}`);
    });
});
