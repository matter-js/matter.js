/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StorageError } from "#storage/Storage.js";
import { StorageBackendMemory } from "#storage/StorageBackendMemory.js";
import { StorageContext } from "#storage/StorageContext.js";
import { StorageManager } from "#storage/StorageManager.js";
import { SupportedStorageTypes } from "#storage/StringifyTools.js";
import { Bytes } from "#util/Bytes.js";

type TestVector = { [testName: string]: { key: string; input: SupportedStorageTypes } };

const validateStorageTestVector: TestVector = {
    "store and retrieve string": { key: "stringKey", input: "value" },
    "store and retrieve number": { key: "numberKey", input: 1234 },
    "store and retrieve boolean": { key: "booleanKey", input: true },
    "store and retrieve bigint": { key: "bigintKey", input: BigInt(123456789) },
    "store and retrieve ByteArray": { key: "ByteArrayKey", input: Bytes.of(Bytes.fromHex("010203040506070809")) },
    "store and retrieve array of string": { key: "stringArrayKey", input: ["1", "2", "3"] },
    "store and retrieve object": { key: "stringArrayKey", input: { key1: "value1", key2: 2 } },
};

const CONTEXTx1 = ["context"];
const CONTEXTx2 = [...CONTEXTx1, "subcontext"];
const CONTEXTx3 = [...CONTEXTx2, "subsubcontext"];

async function create(contexts = CONTEXTx1) {
    const storage = new StorageBackendMemory();
    storage.initialize();
    const storageContext = new StorageContext(storage, contexts);
    return { storage, storageContext };
}

describe("StorageContext", () => {
    describe("Write and read type tests", () => {
        for (const [testName, testVector] of Object.entries(validateStorageTestVector)) {
            it(testName, async () => {
                const { storageContext } = await create();
                storageContext.set(testVector.key, testVector.input);
                const valueFromStorage = storageContext.get(testVector.key);
                expect(valueFromStorage).deep.equal(testVector.input);
            });
        }
    });

    describe("Write and read type tests multiple context levels", () => {
        for (const [testName, testVector] of Object.entries(validateStorageTestVector)) {
            it(testName, async () => {
                const { storageContext } = await create(CONTEXTx3);
                storageContext.set(testVector.key, testVector.input);
                const valueFromStorage = storageContext.get(testVector.key);
                expect(valueFromStorage).deep.equal(testVector.input);
            });
        }
    });

    it("write and read", async () => {
        const { storage, storageContext } = await create();

        storageContext.set("key", "value");

        const valueFromStorage = storageContext.get("key");
        expect(valueFromStorage).equal("value");

        const valueFromStorageWithContext = storage.get(CONTEXTx1, "key");
        expect(valueFromStorageWithContext).equal("value");
    });

    it("write and read wib subcontexts", async () => {
        const { storage, storageContext } = await create(CONTEXTx3);

        storageContext.set("key", "value");

        const valueFromStorage = storageContext.get("key");
        expect(valueFromStorage).equal("value");

        const valueFromStorageWithContext = storage.get(CONTEXTx3, "key");
        expect(valueFromStorageWithContext).equal("value");
    });

    it("read with default value", async () => {
        const { storageContext } = await create();

        const valueFromStorage = storageContext.get("key", "defaultValue");
        expect(valueFromStorage).equal("defaultValue");
    });

    it("Throws error when reading a not set key without default value", async () => {
        const { storageContext } = await create();

        expect(() => {
            storageContext.get("key");
        }).throw(StorageError, "No value found for key key in context context and no default value specified");
    });

    it("check if key is set", async () => {
        const { storageContext } = await create();

        storageContext.set("key", "value");

        expect(storageContext.has("key")).equal(true);
    });

    it("check multi set of keys", async () => {
        const { storageContext } = await create();

        storageContext.set({ key: "value", key2: "value2" });

        expect(storageContext.has("key")).equal(true);
        expect(storageContext.has("key2")).equal(true);
        expect(storageContext.get("key")).equal("value");
        expect(storageContext.get("key2")).equal("value2");
    });

    it("check if key is not set", async () => {
        const { storageContext } = await create();

        storageContext.set("key", "value");

        expect(storageContext.has("key2")).equal(false);
    });

    it("check if key is set with subcontext", async () => {
        const { storageContext } = await create();

        storageContext.set("key", "value");

        expect(storageContext.has("key")).equal(true);
    });

    it("check if key is not set with subcontext", async () => {
        const { storageContext } = await create();

        storageContext.set("key", "value");

        expect(storageContext.has("key2")).equal(false);
    });

    it("create sub StorageContext write and read success", async () => {
        const storage = new StorageBackendMemory();

        const storageManager = new StorageManager(storage);

        await storageManager.initialize();

        const storageContext = storageManager.createContext("context");
        const subStorageContext = storageContext.createContext("subcontext");

        subStorageContext.set("key", "value");

        const valueFromStorage = subStorageContext.get("key");
        expect(valueFromStorage).equal("value");
    });

    it("create sub StorageContext overlapping naming write and read success", async () => {
        const storage = new StorageBackendMemory();

        const storageManager = new StorageManager(storage);

        await storageManager.initialize();

        const storageContext = storageManager.createContext("context");
        const subStorageContext = storageContext.createContext("subcontext");

        subStorageContext.set("key", "value1");
        storageContext.set("subcontext", "value2");

        const valueFromStorage = subStorageContext.get("key");
        expect(valueFromStorage).equal("value1");

        const valueFromStorage2 = storageContext.get("subcontext");
        expect(valueFromStorage2).equal("value2");
    });

    it("getting all keys in a context works", async () => {
        const { storageContext } = await create(CONTEXTx3);

        storageContext.set("key", "value");
        storageContext.set("key2", "value2");
        storageContext.set("key3", "value3");
        storageContext.set("key4", "value4");

        const result = storageContext.keys();

        expect(result).deep.equal(["key", "key2", "key3", "key4"]);
    });

    it("getting all keys in a context works also with sub contexts", async () => {
        const { storage, storageContext } = await create(CONTEXTx2);

        storageContext.set("key", "value");
        storageContext.set("key2", "value2");
        storageContext.set("key3", "value3");
        storageContext.set("key4", "value4");

        const storageContext2 = new StorageContext(storage, CONTEXTx3);

        storageContext2.set("subkey", "value");

        const result = storageContext.keys();

        expect(result).deep.equal(["key", "key2", "key3", "key4"]);
    });

    it("get all values of a context", async () => {
        const { storageContext } = await create(CONTEXTx2);

        storageContext.set("key", "value");
        storageContext.set("key2", "value2");
        storageContext.set("key3", "value3");
        storageContext.set("key4", "value4");

        const result = storageContext.values();

        expect(result).deep.equal({ key: "value", key2: "value2", key3: "value3", key4: "value4" });
    });

    it("clearing keys in a context works", async () => {
        const { storageContext } = await create(CONTEXTx3);

        storageContext.set("key", "value");
        storageContext.set("key2", "value2");
        storageContext.set("key3", "value3");
        storageContext.set("key4", "value4");

        storageContext.clear();

        expect(storageContext.has("key")).equal(false);
        expect(storageContext.has("ke2")).equal(false);
        expect(storageContext.has("key3")).equal(false);
        expect(storageContext.has("key4")).equal(false);
    });

    it("clearing all keys in a context with subcontext works", async () => {
        const { storageContext } = await create(CONTEXTx2);

        storageContext.set("key", "value");
        storageContext.set("key2", "value2");
        storageContext.set("key3", "value3");
        storageContext.set("key4", "value4");

        const subContext = storageContext.createContext("subsubcontext");

        subContext.set("subkey", "value");

        storageContext.clearAll();

        expect(storageContext.has("key")).equal(false);
        expect(storageContext.has("ke2")).equal(false);
        expect(storageContext.has("key3")).equal(false);
        expect(storageContext.has("key4")).equal(false);
        expect(subContext.has("subkey")).equal(false);
    });

    describe("Blob storage functions", () => {
        let storage: StorageBackendMemory;
        let blobContext: StorageContext;

        const CONTEXT = ["test"];
        const KEY = "blobkey";

        beforeEach(async () => {
            storage = await StorageBackendMemory.create();
            blobContext = new StorageContext(storage, CONTEXT);
        });

        it("should write and read a blob", async () => {
            const data = new Uint8Array([1, 2, 3, 4]);
            const stream = new ReadableStream<Bytes>({
                start(controller) {
                    controller.enqueue(data);
                    controller.close();
                },
            });

            await blobContext.writeBlobFromStream(KEY, stream);

            const blob = await blobContext.openBlob(KEY);
            const reader = blob.stream().getReader();
            const chunks: Bytes[] = [];
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                chunks.push(value);
            }
            expect(chunks[0]).deep.equal(data);
        });

        it("should return correct blob size", async () => {
            const data = new Uint8Array([5, 6, 7]);
            storage.set(CONTEXT, KEY, data);

            const size = (await blobContext.openBlob(KEY)).size;
            expect(size).equal(3);
        });

        it("should return empty stream for missing key", async () => {
            const blob = await blobContext.openBlob("missingkey");
            const reader = blob.stream().getReader();
            const { done } = await reader.read();
            expect(done).equal(true);
        });

        it("should throw error for non-Uint8Array value on openBlob", () => {
            storage.set(CONTEXT, "notblob", "stringvalue");
            expect(() => blobContext.openBlob("notblob")).throw(StorageError);
        });
    });
});
