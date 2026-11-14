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

    describe("utf8Length", () => {
        const cases: Record<string, string> = {
            empty: "",
            ASCII: "matter",
            "two-byte": "é",
            "three-byte": "日本",
            "surrogate pair": "😀",
            "lone high surrogate": "a\ud800",
            "lone low surrogate": "\udc00b",
            "reversed surrogates": "\udc00\ud800",
            "two high surrogates": "\ud800\udbff",
            "two low surrogates": "\udc00\udfff",
            "below the surrogate range before a low surrogate": "\ud7ff\udc00",
            "high surrogate before a character above the surrogate range": "\ud800\ue000",
            "highest surrogate pair": "\udbff\udfff",
            mixed: "aé日😀",
        };

        for (const [name, value] of Object.entries(cases)) {
            it(`matches fromString for ${name}`, () => {
                expect(Bytes.utf8Length(value)).equal(Bytes.fromString(value).byteLength);
            });
        }
    });

    describe("truncateUtf8", () => {
        it("keeps a string that fits", () => {
            expect(Bytes.truncateUtf8("aé", 3)).equal("aé");
        });

        it("cuts before a character that does not fit", () => {
            expect(Bytes.truncateUtf8("aé", 2)).equal("a");
        });

        it("does not split a surrogate pair", () => {
            expect(Bytes.truncateUtf8("a😀", 4)).equal("a");
            expect(Bytes.truncateUtf8("a😀", 5)).equal("a😀");
        });

        it("returns an empty string for a limit of 0", () => {
            expect(Bytes.truncateUtf8("a", 0)).equal("");
        });

        it("counts a lone surrogate as three bytes", () => {
            expect(Bytes.truncateUtf8("\ud800", 2)).equal("");
            expect(Bytes.truncateUtf8("\ud800", 3)).equal("\ud800");
        });

        it("cuts by bytes, not characters", () => {
            expect(Bytes.truncateUtf8("日".repeat(20), 32)).equal("日".repeat(10));
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
