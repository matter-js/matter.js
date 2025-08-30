/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BytesStreamReader } from "#storage/BytesStreamReader.js";

describe("ByteStreamReader", () => {
    it("Successfully reads data without skipping", async () => {
        // Create test data
        const testData = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        const chunkSize = 3;

        // Create ReadableStream
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(testData.slice(0, 3)); // [1,2,3]
                controller.enqueue(testData.slice(3, 6)); // [4,5,6]
                controller.enqueue(testData.slice(6)); // [7,8]
                controller.close();
            },
        });

        // Initialize BytesStreamReader
        const reader = stream.getReader();
        const bytesStreamReader = new BytesStreamReader(reader);

        const result: Uint8Array<any>[] = [];
        for await (const chunk of bytesStreamReader.read(chunkSize)) {
            result.push(new Uint8Array(chunk));
        }

        // Expected chunks: [[1,2,3],[4,5,6],[7,8]]
        expect(result).deep.equals([new Uint8Array([1, 2, 3]), new Uint8Array([4, 5, 6]), new Uint8Array([7, 8])]);
    });

    it("skips 2 bytes at beginning and reads remaining data correctly", async () => {
        // Create test data
        const testData = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
        const chunkSize = 3;

        // Create ReadableStream
        // Emit data also in bigger size then the chunk size
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(testData.slice(0, 4)); // [10,20,30,40]
                controller.enqueue(testData.slice(4)); // [50,60,70,80]
                controller.close();
            },
        });

        // Initialize BytesStreamReader
        const reader = stream.getReader();
        const bytesStreamReader = new BytesStreamReader(reader);

        // Skip the first 2 bytes
        const skipped = await bytesStreamReader.skip(2);
        expect(skipped).equals(2);

        // Read the remaining data in chunks
        const result: Uint8Array<any>[] = [];
        for await (const chunk of bytesStreamReader.read(chunkSize)) {
            result.push(new Uint8Array(chunk));
        }

        // Expected chunks: [[30,40,50],[60,70,80]]
        expect(result).deep.equals([new Uint8Array([30, 40, 50]), new Uint8Array([60, 70, 80])]);
    });

    it("skips bytes after first chunk was read", async () => {
        // Create test data
        const testData = new Uint8Array([100, 101, 102, 103, 104, 105, 106, 107]);
        const chunkSize = 3;

        // Create ReadableStream
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(testData.slice(0, 4)); // [100,101,102,103]
                controller.enqueue(testData.slice(4)); // [104,105,106,107]
                controller.close();
            },
        });

        // Initialize BytesStreamReader
        const reader = stream.getReader();
        const bytesStreamReader = new BytesStreamReader(reader);
        // Read the first chunk
        const iterator = bytesStreamReader.read(chunkSize);
        const { value: firstChunk, done: firstChunkDone } = await iterator.next();
        expect(firstChunk).deep.equals(new Uint8Array([100, 101, 102]));
        expect(!!firstChunkDone).equals(false);

        // Skip the next 3 bytes (103, 104)
        // Data also written in two chunks so also tested that reading more during skip worked
        const skipped = await bytesStreamReader.skip(2);
        expect(skipped).equals(2);

        // Read the remaining data in chunks
        const { value: secondChunk, done: secondChunkDone } = await iterator.next();
        // Expected chunks: [[105,106,107]]
        expect(secondChunk).deep.equals(new Uint8Array([105, 106, 107]));
        expect(!!secondChunkDone).equals(false);

        // Read the remaining data in chunks
        const { value: endChunk, done: endChunkDone } = await iterator.next();
        expect(endChunk).equals(undefined);
        expect(endChunkDone).equals(true);
    });

    it("skips the last bytes and returns empty result", async () => {
        // Create test data
        const testData = new Uint8Array([200, 201, 202, 203, 204, 205]);
        const chunkSize = 2;

        // Create ReadableStream
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(testData.slice(0, 3)); // [200,201,202]
                controller.enqueue(testData.slice(3)); // [203,204,205]
                controller.close();
            },
        });

        // Initialize BytesStreamReader
        const reader = stream.getReader();
        const bytesStreamReader = new BytesStreamReader(reader);
        // Read the first chunk
        const iterator = bytesStreamReader.read(chunkSize);
        const { value: firstChunk, done: firstChunkDone } = await iterator.next();
        expect(firstChunk).deep.equals(new Uint8Array([200, 201]));
        expect(!!firstChunkDone).equals(false);

        // Read the next data in chunks
        const { value: secondChunk, done: secondChunkDone } = await iterator.next();
        // Expected chunks: [[202,203]]
        expect(secondChunk).deep.equals(new Uint8Array([202, 203]));
        expect(!!secondChunkDone).equals(false);

        // Skip the next 3 bytes (204, 205)
        const skipped = await bytesStreamReader.skip(3);
        expect(skipped).equals(2); // only two were left so we only skipped 2

        // Read the remaining data in chunks
        const { value: endChunk, done: endChunkDone } = await iterator.next();
        expect(endChunk).equals(undefined);
        expect(endChunkDone).equals(true);
    });
});
