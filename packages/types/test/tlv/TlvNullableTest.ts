/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BitFlag } from "#schema/BitmapSchema.js";
import { TlvAny } from "#tlv/TlvAny.js";
import { TlvArray } from "#tlv/TlvArray.js";
import { TlvNullable } from "#tlv/TlvNullable.js";
import { TlvBitmap, TlvUInt16, TlvUInt8 } from "#tlv/TlvNumber.js";
import { TlvString } from "#tlv/TlvString.js";
import { TlvByteString } from "#tlv/index.js";
import { Bytes } from "@matter/general";

type CodecVector<I, E> = { [valueDescription: string]: { encoded: E; decoded: I } };

const codecVector: CodecVector<string | null, string> = {
    "a non-null value": { decoded: "a", encoded: "0c0161" },
    "a null value": { decoded: null, encoded: "14" },
};

describe("TlvNullable", () => {
    const schemaString = TlvNullable(TlvString);
    const schemaBytes = TlvNullable(TlvByteString);
    const schemaArray = TlvNullable(TlvArray(TlvString));

    describe("encode", () => {
        for (const valueDescription in codecVector) {
            const { encoded, decoded } = codecVector[valueDescription];
            it(`encodes ${valueDescription}`, () => {
                expect(Bytes.toHex(schemaString.encode(decoded))).equal(encoded);
            });
        }
    });

    describe("calculate byte length", () => {
        for (const valueDescription in codecVector) {
            const { encoded, decoded } = codecVector[valueDescription];
            it(`calculate byte length ${valueDescription}`, () => {
                const tlvEncoded = schemaString.encodeTlv(decoded);
                expect(TlvAny.getEncodedByteLength(tlvEncoded)).equal(encoded.length / 2);
            });
        }
    });

    describe("decode", () => {
        for (const valueDescription in codecVector) {
            const { encoded, decoded } = codecVector[valueDescription];
            it(`decodes ${valueDescription}`, () => {
                expect(schemaString.decode(Bytes.fromHex(encoded))).equal(decoded);
            });
        }
    });

    describe("decode nullable types with constraints but zero length as null", () => {
        it("decodes null correctly without constraint", () => {
            const encoded = schemaString.encode(null);
            const schemaWithConstraint = TlvNullable(TlvString.bound({ minLength: 0 }));
            expect(schemaWithConstraint.decode(encoded)).equal(null);
        });

        it("decodes null correctly with constraint", () => {
            const encoded = schemaString.encode(null);
            const schemaWithConstraint = TlvNullable(TlvString.bound({ minLength: 1 }));
            expect(schemaWithConstraint.decode(encoded)).equal(null);
        });

        it("decodes zero length string with minlength 0 as empty string", () => {
            const encoded = schemaString.encode("");
            const schemaWithConstraint = TlvNullable(TlvString.bound({ minLength: 0 }));
            expect(schemaWithConstraint.decode(encoded)).equal("");
        });

        it("decodes zero length byte-string with minlength 0 as null", () => {
            const encoded = schemaBytes.encode(new Uint8Array());
            const schemaWithConstraint = TlvNullable(TlvByteString.bound({ minLength: 0 }));
            expect(schemaWithConstraint.decode(encoded)).equal(null);
        });

        it("decodes zero length string with constraint as null", () => {
            const encoded = schemaString.encode("");
            const schemaWithConstraint = TlvNullable(TlvString.bound({ minLength: 1 }));
            expect(schemaWithConstraint.decode(encoded)).equal(null);
        });

        it("decodes zero length array with minlength 0 as empty array", () => {
            const encoded = schemaArray.encode([]);
            const schemaWithConstraint = TlvNullable(TlvArray(TlvString, { minLength: 0 }));
            expect(schemaWithConstraint.decode(encoded)).deep.equal([]);
        });

        it("decodes zero length array with constraint as null", () => {
            const encoded = schemaArray.encode([]);
            const schemaWithConstraint = TlvNullable(TlvArray(TlvString, { minLength: 1 }));
            expect(schemaWithConstraint.decode(encoded)).equal(null);
        });
    });

    describe("nullable bitmap reserves the most-significant bit (§7.19.1.2)", () => {
        const map8 = TlvNullable(TlvBitmap(TlvUInt8, { lsb: BitFlag(0), msb: BitFlag(7) }));
        const map16 = TlvNullable(TlvBitmap(TlvUInt16, { lsb: BitFlag(0), msb: BitFlag(15) }));

        it("rejects map8 with the reserved MSB set", () => {
            expect(() => map8.validate({ msb: true })).throw();
        });

        it("accepts map8 with only lower bits set", () => {
            expect(() => map8.validate({ lsb: true })).not.throw();
        });

        it("rejects map16 with the reserved MSB set", () => {
            expect(() => map16.validate({ msb: true })).throw();
        });

        it("accepts map16 with only lower bits set", () => {
            expect(() => map16.validate({ lsb: true })).not.throw();
        });
    });
});
