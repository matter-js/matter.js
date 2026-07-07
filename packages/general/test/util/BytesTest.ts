/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";

describe("ByteArray", () => {
    describe("fromHex", () => {
        it("decodes the hex string", () => {
            const result = Bytes.fromHex("1234");

            expect(result).deep.equal(Uint8Array.of(0x12, 0x34));
        });

        it("decodes an empty array", () => {
            const result = Bytes.fromHex("");

            expect(result).deep.equal(new Uint8Array(0));
        });
    });

    describe("fromBase64", () => {
        it("decodes the base64 string", () => {
            const result = Bytes.fromBase64("EjQ=");

            expect(result).deep.equal(Uint8Array.of(0x12, 0x34));
        });

        it("decodes the base64 string with trailing/leading 0", () => {
            const result = Bytes.fromBase64("ABI0AA==");

            expect(result).deep.equal(Uint8Array.of(0x00, 0x12, 0x34, 0x00));
        });

        it("decodes an empty array", () => {
            const result = Bytes.fromBase64("");

            expect(result).deep.equal(new Uint8Array(0));
        });
    });

    describe("fromString", () => {
        it("get the bytes of a string", () => {
            const result = Bytes.fromString("0");

            expect(result).deep.equal(Uint8Array.of(0x30));
        });
    });

    describe("toHex", () => {
        it("encodes the bytes as a hex string", () => {
            const result = Bytes.toHex(Uint8Array.of(0x12, 0x34));

            expect(result).equal("1234");
        });

        it("encodes an empty array", () => {
            const result = Bytes.toHex(new Uint8Array(0));

            expect(result).equal("");
        });
    });

    describe("toBase64", () => {
        it("encodes the bytes as a base64 string", () => {
            const result = Bytes.toBase64(Uint8Array.of(0x12, 0x34));

            expect(result).equal("EjQ=");
        });

        it("encodes the bytes as a hex string with leading/trailing 0", () => {
            const result = Bytes.toBase64(Uint8Array.of(0x00, 0x12, 0x34, 0x00));

            expect(result).equal("ABI0AA==");
        });

        it("encodes an empty array", () => {
            const result = Bytes.toBase64(new Uint8Array(0));

            expect(result).equal("");
        });
    });

    describe("concat", () => {
        it("concats two ByteArrays", () => {
            const result = Bytes.concat(Uint8Array.of(0x12), Uint8Array.of(0x34));

            expect(result).deep.equal(Uint8Array.of(0x12, 0x34));
        });
    });

    describe("of", () => {
        it("preserves byteOffset and byteLength of a non-Uint8Array view", () => {
            const buffer = Uint8Array.of(0x01, 0x02, 0x03, 0x04, 0x05, 0x06).buffer;
            const view = new DataView(buffer, 2, 3);

            const result = Bytes.of(view);

            expect(result).deep.equal(Uint8Array.of(0x03, 0x04, 0x05));
        });
    });
});
