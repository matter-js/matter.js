/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Gzip } from "#util/Gzip.js";

describe("Gzip", () => {
    it("is supported in Node.js", () => {
        expect(Gzip.isAvailable).equal(true);
    });

    it("roundtrips data through compress and decompress", async () => {
        const input = new TextEncoder().encode("Hello, gzip world!");

        const decompressed = Array<Uint8Array>();
        for await (const chunk of Gzip.decompress(Gzip.compress([input]))) {
            decompressed.push(chunk);
        }

        const totalLength = decompressed.reduce((sum, c) => sum + c.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of decompressed) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }

        expect(new TextDecoder().decode(combined)).equal("Hello, gzip world!");
    });

    it("produces output different from input", async () => {
        const input = new TextEncoder().encode("Some data to compress");

        const compressed = Array<Uint8Array>();
        for await (const chunk of Gzip.compress([input])) {
            compressed.push(chunk);
        }

        const totalLength = compressed.reduce((sum, c) => sum + c.length, 0);
        const combined = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of compressed) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }

        // Compressed output should differ from the raw input
        const inputBytes = Array.from(input);
        const outputBytes = Array.from(combined);
        expect(outputBytes).not.deep.equal(inputBytes);
    });

    it("roundtrips empty input", async () => {
        const input = new Uint8Array(0);

        const decompressed = Array<Uint8Array>();
        for await (const chunk of Gzip.decompress(Gzip.compress([input]))) {
            decompressed.push(chunk);
        }

        const totalLength = decompressed.reduce((sum, c) => sum + c.length, 0);
        expect(totalLength).equal(0);
    });
});
