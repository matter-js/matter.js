/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EndOfStreamError, Stream } from "#util/Streams.js";

async function collect<T>(stream: ReadableStream<T>) {
    const out = new Array<T>();
    for await (const value of Stream.iterable(stream)) {
        out.push(value);
    }
    return out;
}

describe("Stream", () => {
    it("creates a readable stream from a sync iterable", async () => {
        expect(await collect(Stream.from([1, 2, 3]))).deep.equal([1, 2, 3]);
    });

    it("creates a readable stream from an async iterable", async () => {
        async function* source() {
            yield "a";
            yield "b";
        }

        expect(await collect(Stream.from(source()))).deep.equal(["a", "b"]);
    });

    it("yields nothing for an empty source", async () => {
        expect(await collect(Stream.from([]))).deep.equal([]);
    });
});

describe("EndOfStreamError", () => {
    it("has a default message", () => {
        expect(new EndOfStreamError().message).equal("Unexpected end of stream");
    });
});
