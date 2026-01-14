/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationError } from "#common/ValidationError.js";
import { Bytes } from "#general";
import { TlvAny } from "#tlv/TlvAny.js";
import { ArrayAsChunked, ArraySchema, TlvArray } from "#tlv/TlvArray.js";
import { TlvNullable } from "#tlv/TlvNullable.js";
import { TlvString } from "#tlv/TlvString.js";

type TestVector<I, E> = { [testName: string]: { input: I; out: E } };

const validateTestVector: TestVector<string[], boolean | number> = {
    "validates an array with an acceptable length": { input: ["a", "b"], out: false },
    "throws an error if the array is too short": { input: ["a"], out: true },
    "throws an error if the array is too long": { input: ["a", "b", "c", "d", "e"], out: true },
    // @ts-expect-error test case
    "throws an error if entry is wrong datatype": { input: ["a", 7], out: 1 },
};

describe("TlvArray", () => {
    const schema = TlvArray(TlvString);

    describe("encode", () => {
        it("encodes an array", () => {
            const result = schema.encode(["a", "b", "c"]);

            expect(Bytes.toHex(result)).equal("160c01610c01620c016318");
        });

        it(`calculate array byte length`, () => {
            const tlvEncoded = schema.encodeTlv(["a", "b", "c"]);
            expect(TlvAny.getEncodedByteLength(tlvEncoded)).equal(11);
        });

        it("encodes an array to chunks", () => {
            const result = schema.encodeAsChunkedArray(["a", "b", "c"]);

            expect(Bytes.toHex(TlvAny.encode(result[0].element))).equal("1618");
            expect(new ArraySchema(TlvString).decodeTlv(result[0].element)).deep.equal([]);
            expect(result[0].listIndex).equal(undefined);
            expect(Bytes.toHex(TlvAny.encode(result[1].element))).equal("0c0161");
            expect(TlvString.decodeTlv(result[1].element)).equal("a");
            expect(result[1].listIndex).equal(null);
            expect(Bytes.toHex(TlvAny.encode(result[2].element))).equal("0c0162");
            expect(TlvString.decodeTlv(result[2].element)).equal("b");
            expect(result[2].listIndex).equal(null);
            expect(Bytes.toHex(TlvAny.encode(result[3].element))).equal("0c0163");
            expect(TlvString.decodeTlv(result[3].element)).equal("c");
            expect(result[3].listIndex).equal(null);
        });
    });

    describe("decode", () => {
        it("decodes an array", () => {
            const result = schema.decode(Bytes.fromHex("160c01610c01620c016318"));

            expect(result).deep.equal(["a", "b", "c"]);
        });
    });

    describe("decode chunked array", () => {
        it("decodes an encoded array from chunks", () => {
            const encoded = schema.encodeAsChunkedArray(["a", "b", "c"]);

            const decoded = schema.decodeFromChunkedArray(encoded, ["d"]);
            expect(decoded).deep.equal(["a", "b", "c"]);
        });

        it("decodes an encoded array from chunks with adding values", () => {
            const encoded: ArrayAsChunked = [
                { element: TlvString.encodeTlv("a"), listIndex: 1 },
                { element: TlvString.encodeTlv("b"), listIndex: 2 },
                { element: TlvString.encodeTlv("c"), listIndex: 3 },
            ];

            const decoded = schema.decodeFromChunkedArray(encoded, ["d"]);
            expect(decoded).deep.equal(["d", "a", "b", "c"]);
        });

        it("decodes an encoded array from chunks with removing values", () => {
            const encoded: ArrayAsChunked = [
                { element: TlvString.encodeTlv("a"), listIndex: 1 },
                { element: TlvNullable(TlvString).encodeTlv(null), listIndex: 0 },
                { element: TlvString.encodeTlv("c"), listIndex: 2 },
            ];

            const decoded = schema.decodeFromChunkedArray(encoded, ["d"]);
            expect(decoded).deep.equal(["a", undefined, "c"]);
        });

        it("decodes an encoded array from chunks with overwriting values", () => {
            const encoded: ArrayAsChunked = [
                { element: TlvString.encodeTlv("a"), listIndex: 0 },
                { element: TlvString.encodeTlv("c"), listIndex: null },
            ];

            const decoded = schema.decodeFromChunkedArray(encoded, ["a2", "b"]);
            expect(decoded).deep.equal(["a", "b", "c"]);
        });
    });

    describe("decode an self encoded tlv object", () => {
        it("decodes an array", () => {
            const schema = TlvArray(TlvString);

            const data = ["a", "b"];

            const encoded = schema.encodeTlv(data);
            const decoded = schema.decodeTlv(encoded);

            expect(decoded).deep.equal(data);
        });
    });

    describe("validate", () => {
        const schema = TlvArray(TlvString, { minLength: 2, maxLength: 4 });

        for (const testName in validateTestVector) {
            const { input, out: throwException } = validateTestVector[testName];
            it(testName, () => {
                const test = () => schema.validate(input);
                if (typeof throwException === "boolean") {
                    if (throwException) {
                        expect(test).throw();
                    } else {
                        expect(test).not.throw();
                    }
                } else {
                    let hasThrown = false;
                    try {
                        test();
                    } catch (error) {
                        hasThrown = true;
                        expect(error).instanceof(ValidationError);
                        if (error instanceof ValidationError) {
                            expect(error.message).equal(
                                "(ValidationDatatypeMismatchError/128) Expected string, got number.",
                            );
                            expect(error.fieldName).equal(`[${throwException}]`);
                        }
                    }
                    expect(hasThrown).ok;
                }
            });
        }
    });
});
