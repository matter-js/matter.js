/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Base64 } from "#codec/Base64Codec.js";

const tests = {
    zero: {
        bytes: [],
        text: "",
    },

    one: {
        bytes: [0x01],
        text: "AQ==",
    },

    two: {
        bytes: [0x02, 0x04],
        text: "AgQ=",
    },

    three: {
        bytes: [0x30, 0x20, 0x10],
        text: "MCAQ",
    },

    four: {
        bytes: [0x99, 0x66, 0x33, 0x00],
        text: "mWYzAA==",
    },

    five: {
        bytes: [0x00, 0x40, 0x80, 0xc00, 0x00],
        text: "AECAAAA=",
    },

    six: {
        bytes: [0xc0, 0xc0, 0x40, 0x40, 0x80, 0x80],
        text: "wMBAQICA",
    },

    seven: {
        bytes: [0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd],
        text: "ASNFZ4mrzQ==",
    },

    all: {
        bytes: [...Array(256).keys()],
        text: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+P0BBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWltcXV5fYGFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6e3x9fn+AgYKDhIWGh4iJiouMjY6PkJGSk5SVlpeYmZqbnJ2en6ChoqOkpaanqKmqq6ytrq+wsbKztLW2t7i5uru8vb6/wMHCw8TFxsfIycrLzM3Oz9DR0tPU1dbX2Nna29zd3t/g4eLj5OXm5+jp6uvs7e7v8PHy8/T19vf4+fr7/P3+/w==",
        textUrl: "",
    },
};
tests.all.textUrl = tests.all.text.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

describe("Base64", () => {
    const expectEncodeAs = (bytes: number[], text: string) =>
        expect(Base64.encode(new Uint8Array(bytes))).deep.equal(text);

    describe("encode", () => {
        Object.entries(tests).forEach(([name, test]) => {
            it(`encodes ${name}`, () => {
                expectEncodeAs(test.bytes, test.text);
            });
        });

        it("encodes base64url", () => {
            expect(Base64.encode(tests.all.bytes, true)).deep.equal(tests.all.textUrl);
        });
    });

    const expectDecodesAs = (text: string, bytes: number[]) =>
        expect(Base64.decode(text)).deep.equal(new Uint8Array(bytes));

    describe("decode", () => {
        Object.entries(tests).forEach(([name, test]) => {
            it(`decodes ${name}`, () => {
                expectDecodesAs(test.text, test.bytes);
            });
        });

        it("accepts one missing pad", () => {
            expectDecodesAs("AQ=", tests.one.bytes);
            expectDecodesAs("AgQ", tests.two.bytes);
        });

        it("accepts two missing pads", () => {
            expectDecodesAs("AQ", tests.one.bytes);
        });

        it("decodes base64url", () => {
            expectDecodesAs(tests.all.textUrl, tests.all.bytes);
        });

        it("rejects truncated input", () => {
            expect(() => Base64.decode("A")).throw("Invalid base-64 encoding");
        });

        it("rejects invalid characters", () => {
            expect(() => Base64.decode("?")).throw("Invalid base-64 encoding");
        });
    });
});
