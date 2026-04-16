/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MemoryBlobStorageDriver } from "#storage/MemoryBlobStorageDriver.js";
import { Bytes } from "#util/Bytes.js";

function createDriver() {
    const driver = new MemoryBlobStorageDriver();
    driver.initialize();
    return driver;
}

const CONTEXTx1 = ["context"];
const CONTEXTx2 = [...CONTEXTx1, "subcontext"];

function makeStream(data: Uint8Array): ReadableStream<Bytes> {
    return new ReadableStream<Bytes>({
        start(controller) {
            controller.enqueue(data);
            controller.close();
        },
    });
}

describe("MemoryBlobStorageDriver", () => {
    it("writeBlobFromStream and openBlob round-trip", async () => {
        const driver = createDriver();
        const data = new Uint8Array([1, 2, 3, 4, 5]);

        await driver.writeBlobFromStream(CONTEXTx1, "myblob", makeStream(data));

        const blob = driver.openBlob(CONTEXTx1, "myblob");
        const reader = blob.stream().getReader();
        const chunks: Bytes[] = [];
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        expect(chunks[0]).deep.equal(data);
    });

    it("openBlob returns empty Blob for missing key", async () => {
        const driver = createDriver();
        const blob = driver.openBlob(CONTEXTx1, "missing");
        const reader = blob.stream().getReader();
        const { done } = await reader.read();
        expect(done).equal(true);
    });

    it("has returns true for existing key, false for missing", async () => {
        const driver = createDriver();
        await driver.writeBlobFromStream(CONTEXTx1, "exists", makeStream(new Uint8Array([1])));

        expect(driver.has(CONTEXTx1, "exists")).equal(true);
        expect(driver.has(CONTEXTx1, "nope")).equal(false);
    });

    it("keys lists blob keys in a context", async () => {
        const driver = createDriver();
        await driver.writeBlobFromStream(CONTEXTx1, "a", makeStream(new Uint8Array([1])));
        await driver.writeBlobFromStream(CONTEXTx1, "b", makeStream(new Uint8Array([2])));
        await driver.writeBlobFromStream(CONTEXTx2, "c", makeStream(new Uint8Array([3])));

        const keys = driver.keys(CONTEXTx1);
        expect(keys).to.have.members(["a", "b"]);
        expect(keys).to.have.lengthOf(2);
    });

    it("delete removes a blob", async () => {
        const driver = createDriver();
        await driver.writeBlobFromStream(CONTEXTx1, "todelete", makeStream(new Uint8Array([1])));
        expect(driver.has(CONTEXTx1, "todelete")).equal(true);

        driver.delete(CONTEXTx1, "todelete");
        expect(driver.has(CONTEXTx1, "todelete")).equal(false);
    });

    it("contexts lists sub-contexts", async () => {
        const driver = createDriver();
        await driver.writeBlobFromStream(CONTEXTx2, "x", makeStream(new Uint8Array([1])));
        await driver.writeBlobFromStream([...CONTEXTx1, "other"], "y", makeStream(new Uint8Array([2])));

        const ctxs = driver.contexts(CONTEXTx1);
        expect(ctxs).to.have.members(["subcontext", "other"]);
    });

    it("clearAll removes all blobs in a context and sub-contexts", async () => {
        const driver = createDriver();
        await driver.writeBlobFromStream(CONTEXTx1, "root", makeStream(new Uint8Array([1])));
        await driver.writeBlobFromStream(CONTEXTx2, "child", makeStream(new Uint8Array([2])));

        driver.clearAll(CONTEXTx1);

        expect(driver.has(CONTEXTx1, "root")).equal(false);
        expect(driver.has(CONTEXTx2, "child")).equal(false);
    });

    it("blob size is correct after write", async () => {
        const driver = createDriver();
        const data = new Uint8Array([10, 20, 30]);
        await driver.writeBlobFromStream(CONTEXTx1, "sized", makeStream(data));

        const blob = driver.openBlob(CONTEXTx1, "sized");
        expect(blob.size).equal(3);
    });
});
