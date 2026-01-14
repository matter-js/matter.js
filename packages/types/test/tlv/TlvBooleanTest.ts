/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationError } from "#common/ValidationError.js";
import { Bytes } from "#general";
import { TlvAny } from "#tlv/TlvAny.js";
import { TlvBoolean } from "#tlv/TlvBoolean.js";

type CodecVector<I, E> = { [valueDescription: string]: { encoded: I; decoded: E } };

const testVector: CodecVector<string, boolean> = {
    true: { encoded: "09", decoded: true },
    false: { encoded: "08", decoded: false },
};

describe("TlvBoolean", () => {
    describe("encode", () => {
        for (const valueDescription in testVector) {
            const { encoded, decoded } = testVector[valueDescription];
            it(`encodes ${valueDescription}`, () => {
                expect(Bytes.toHex(TlvBoolean.encode(decoded))).equal(encoded);
            });
        }
    });

    describe("decode", () => {
        for (const valueDescription in testVector) {
            const { encoded, decoded } = testVector[valueDescription];
            it(`decodes ${valueDescription}`, () => {
                expect(TlvBoolean.decode(Bytes.fromHex(encoded))).equal(decoded);
            });
        }
    });

    describe("calculate byte length", () => {
        for (const valueDescription in testVector) {
            const { encoded, decoded } = testVector[valueDescription];
            it(`calculate byte length ${valueDescription}`, () => {
                const tlvEncoded = TlvBoolean.encodeTlv(decoded);
                expect(TlvAny.getEncodedByteLength(tlvEncoded)).equal(encoded.length / 2);
            });
        }
    });

    describe("validation", () => {
        it("throws an error if the value is not a boolean", () => {
            expect(() => TlvBoolean.validate("a" as any)).throw(ValidationError, "Expected boolean, got string.");
        });

        it("does not throw an error if the value is a boolean", () => {
            expect(TlvBoolean.validate(true)).undefined;
        });
    });
});
