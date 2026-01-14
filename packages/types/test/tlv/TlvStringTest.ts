/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationError } from "#common/ValidationError.js";
import { Bytes } from "#general";
import { TlvAny } from "#tlv/TlvAny.js";
import { TlvByteString, TlvString } from "#tlv/TlvString.js";

type TestVector<I, E> = { [testName: string]: { input: I; out: E } };

const validateUtfStringTestVector: TestVector<string, boolean> = {
    "validates a string with an acceptable length": { input: "abcde", out: false },
    "throws an error if the string is too short": { input: "a", out: true },
    "throws an error if the string is too long": { input: "abcdefgh", out: true },
};

const validateByteStringTestVector: TestVector<string, boolean> = {
    "validates a string with an acceptable length": { input: "0001020304", out: false },
    "throws an error if the string is too short": { input: "00", out: true },
    "throws an error if the string is too long": { input: "0001020304050607", out: true },
};

describe("TlvString", () => {
    describe("encode", () => {
        it("encodes a string", () => {
            const result = TlvString.encode("test");

            expect(Bytes.toHex(result)).equal("0c0474657374");
        });

        it("encodes a string that gets utf8 encoded", () => {
            const result = TlvString.encode("testè");

            expect(Bytes.toHex(result)).equal("0c0674657374c3a8");
        });
    });

    describe("decode", () => {
        it("decodes a string", () => {
            const result = TlvString.decode(Bytes.fromHex("0c0474657374"));

            expect(result).equal("test");
        });

        it("decodes a string that was utf8", () => {
            const result = TlvString.decode(Bytes.fromHex("0c0674657374c3a8"));

            expect(result).equal("testè");
        });
    });

    describe("calculate byte size", () => {
        it("calculate byte size a string", () => {
            const tlvEncoded = TlvString.encodeTlv("test");
            expect(TlvAny.getEncodedByteLength(tlvEncoded)).equal(6);
        });

        it("calculate byte size a string that was utf8", () => {
            const tlvEncoded = TlvString.encodeTlv("testè");
            expect(TlvAny.getEncodedByteLength(tlvEncoded)).equal(8);
        });
    });

    describe("validate", () => {
        const BoundedInt = TlvString.bound({ minLength: 4, maxLength: 6 });

        for (const testName in validateUtfStringTestVector) {
            const { input, out: throwException } = validateUtfStringTestVector[testName];
            it(testName, () => {
                const test = () => BoundedInt.validate(input);
                if (throwException) {
                    expect(test).throw();
                } else {
                    expect(test).not.throw();
                }
            });
        }
    });
});

describe("TlvByteString", () => {
    describe("encode", () => {
        it("encodes a byte string", () => {
            const result = TlvByteString.encode(Bytes.of(Bytes.fromHex("0001")));

            expect(Bytes.toHex(result)).equal("10020001");
        });
    });

    describe("decode", () => {
        it("decodes a byte string", () => {
            const result = TlvByteString.decode(Bytes.fromHex("10020001"));

            expect(Bytes.toHex(result)).equal("0001");
        });
    });

    describe("validate ByteString", () => {
        const BoundedInt = TlvByteString.bound({ minLength: 4, maxLength: 6 });

        for (const testName in validateByteStringTestVector) {
            const { input, out: throwException } = validateByteStringTestVector[testName];
            it(testName, () => {
                const test = () => BoundedInt.validate(Bytes.of(Bytes.fromHex(input)));
                if (throwException) {
                    expect(test).throw();
                } else {
                    expect(test).not.throw();
                }
            });
        }
    });

    describe("validation", () => {
        it("throws an error if the value is not a ByteString", () => {
            expect(() => TlvByteString.validate(5 as any)).throw(ValidationError, "Expected bytes, got number.");
        });

        it("throws an error if the value is not a String", () => {
            expect(() => TlvString.validate(true as any)).throw(ValidationError, "Expected string, got boolean.");
        });
    });
});
