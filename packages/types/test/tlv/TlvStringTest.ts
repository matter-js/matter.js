/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationError } from "#common/ValidationError.js";
import { TlvAny } from "#tlv/TlvAny.js";
import { TlvByteString, TlvString } from "#tlv/TlvString.js";
import { Bytes } from "@matter/general";

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

        it("uses a two-byte length field from 256 bytes even when the string has fewer characters", () => {
            const value = "日".repeat(86);
            const result = TlvString.encode(value);

            expect(Bytes.toHex(result).slice(0, 6)).equal("0d0201");
            expect(TlvString.decode(result)).equal(value);
        });

        it("uses a four-byte length field from 65536 bytes even when the string has fewer characters", () => {
            const Unbounded = TlvString.bound({ maxLength: 100_000 });
            const value = "日".repeat(21_846);
            const result = Unbounded.encode(value);

            expect(Bytes.toHex(result).slice(0, 10)).equal("0e02000100");
            expect(Unbounded.decode(result)).equal(value);
        });

        it("uses a two-byte length field when multi-byte characters exceed 255 bytes", () => {
            const value = "日".repeat(100);
            const result = TlvString.encode(value);

            expect(Bytes.toHex(result).slice(0, 6)).equal("0d2c01");
            expect(result.byteLength).equal(303);
            expect(TlvString.decode(result)).equal(value);
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

        it("truncates a character string at the first Information Separator 1 (0x1F)", () => {
            const result = TlvString.decode(Bytes.fromHex("0c0561621f6364"));

            expect(result).equal("ab");
        });

        it("returns an empty string when Information Separator 1 (0x1F) is the first code point", () => {
            const result = TlvString.decode(Bytes.fromHex("0c031f6364"));

            expect(result).equal("");
        });

        it("enforces maxLength against the raw on-wire string, not the truncated prefix", () => {
            const Bounded = TlvString.bound({ maxLength: 4 });

            expect(() => Bounded.decode(Bytes.fromHex("0c0661621f636465"))).throw(ValidationError, "too long");
        });

        it("enforces maxLength in UTF-8 bytes on the string before Information Separator 1 truncation", () => {
            const Bounded = TlvString.bound({ maxLength: 4 });

            expect(() => Bounded.decode(Bytes.fromHex("0c06c3a9c3a91f61"))).throw(ValidationError, "6 bytes");
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

        it("counts maxLength in UTF-8 bytes", () => {
            const Bounded = TlvString.bound({ maxLength: 64 });

            expect(() => Bounded.validate("日".repeat(21))).not.throw();
            expect(() => Bounded.validate("日".repeat(22))).throw(ValidationError, "66 bytes, max 64");
        });

        it("counts minLength in UTF-8 bytes", () => {
            const Bounded = TlvString.bound({ minLength: 4 });

            expect(() => Bounded.validate("éé")).not.throw();
            expect(() => Bounded.validate("éa")).throw(ValidationError, "3 bytes, min 4");
        });
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

        it("does not truncate a byte string at 0x1F (IS1 rule is character-string only)", () => {
            const result = TlvByteString.decode(Bytes.fromHex("1003001f02"));

            expect(Bytes.toHex(result)).equal("001f02");
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

        it("throws an error if a character string contains Information Separator 1 (0x1F)", () => {
            expect(() => TlvString.validate("ab\u001fcd")).throw(
                ValidationError,
                "Character string must not contain Information Separator 1 (0x1F).",
            );
        });

        it("does not reject a byte string containing 0x1F", () => {
            expect(() => TlvByteString.validate(Bytes.fromHex("001f02"))).not.throw();
        });
    });
});
