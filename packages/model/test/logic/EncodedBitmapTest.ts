/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeModel, DecodedBitmap, EncodedBitmap, FeatureMap, FieldElement as Field } from "#index.js";

// Simple bitmap attribute with two single-bit flags (bits 0 and 1) — matches real featureMap usage
const BitmapAttr = new AttributeModel(
    { id: 1, name: "TestBitmap", type: "bitmap8" },
    Field({ name: "flagA", constraint: "0" }),
    Field({ name: "flagB", constraint: "1" }),
    Field({ name: "flagC", constraint: "2" }),
);

// FeatureMap attribute using the standard element, extended with two features (uses title as key)
const FeatureMapAttr = FeatureMap.extend(
    {},
    Field({ id: 0, name: "LS", title: "LatchingSwitch", constraint: "0" }),
    Field({ id: 1, name: "MS", title: "MomentarySwitch", constraint: "1" }),
);

// Bitmap attribute with multi-bit range fields for numeric branch coverage
const MultiBitAttr = new AttributeModel(
    { id: 2, name: "MultiBit", type: "bitmap8" },
    Field({ name: "multiA", constraint: "0 to 2" }), // 3-bit field at bit positions 0–2
    Field({ name: "multiB", constraint: "4 to 6" }), // 3-bit field at bit positions 4–6
);

// Bitmap attribute with a wide range field whose encoded value can exceed Number.MAX_SAFE_INTEGER
const LargeBitmapAttr = new AttributeModel(
    { id: 3, name: "LargeBitmap", type: "bitmap64" },
    Field({ name: "largeBits", constraint: "0 to 56" }), // 57-bit field
);

describe("EncodedBitmap", () => {
    it("returns numeric input unchanged", () => {
        expect(EncodedBitmap(BitmapAttr, 42)).equals(42);
    });

    it("returns bigint input unchanged", () => {
        expect(EncodedBitmap(BitmapAttr, 42n)).equals(42n);
    });

    it("encodes single-bit boolean flags", () => {
        expect(EncodedBitmap(BitmapAttr, { flagA: true, flagB: true })).equals(0b11);
    });

    it("encodes one flag and leaves others clear", () => {
        expect(EncodedBitmap(BitmapAttr, { flagB: true })).equals(0b10);
    });

    it("encodes multiple non-adjacent flags", () => {
        expect(EncodedBitmap(BitmapAttr, { flagA: true, flagC: true })).equals(0b101);
    });

    it("encodes FeatureMap using title as key", () => {
        expect(EncodedBitmap(FeatureMapAttr as unknown as AttributeModel, { latchingSwitch: true })).equals(0b01);
        expect(EncodedBitmap(FeatureMapAttr as unknown as AttributeModel, { momentarySwitch: true })).equals(0b10);
        expect(
            EncodedBitmap(FeatureMapAttr as unknown as AttributeModel, { latchingSwitch: true, momentarySwitch: true }),
        ).equals(0b11);
    });

    it("encodes multi-bit numeric field (typeof bitval === 'number' branch)", () => {
        // Field "multiA" spans bit positions 0–2; value 3 means bits 0 and 1 are set → bitmap 0b011 = 3
        expect(EncodedBitmap(MultiBitAttr, { multiA: 3 })).equals(3);
        // Field "multiB" spans bit positions 4–6; value 3 means bits 4 and 5 are set → bitmap 0b110000 = 48
        expect(EncodedBitmap(MultiBitAttr, { multiB: 3 })).equals(48);
    });

    it("encodes multi-bit bigint field value above MAX_SAFE_INTEGER (bigint mask fix)", () => {
        // 2n**53n + 1n > Number.MAX_SAFE_INTEGER; the result should be returned as a BigInt.
        // With the old (buggy) mask `2n**56n << 0n` this would be masked to 0n because neither
        // set bit (0 and 53) matches the single bit at position 56. The fix subtracts 1n to
        // produce a proper bitmask covering all 56 bit positions, preserving the value intact.
        const value = 2n ** 53n + 1n;
        expect(EncodedBitmap(LargeBitmapAttr, { largeBits: value } as unknown as DecodedBitmap)).equals(value);
    });
});
