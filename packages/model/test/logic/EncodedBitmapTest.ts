/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeModel,
    DecodedBitmap,
    EncodedBitmap,
    FeatureMap,
    FieldElement as Field,
    Matter,
    Scope,
} from "#index.js";

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

const ShiftedLargeBitmapAttr = new AttributeModel(
    { id: 4, name: "ShiftedLargeBitmap", type: "bitmap64" },
    Field({ name: "highBits", constraint: "4 to 63" }),
);

const OpenBitmapAttr = new AttributeModel(
    { id: 5, name: "OpenBitmap", type: "bitmap16" },
    Field({ name: "flag", constraint: "0" }),
    Field({ name: "rest", constraint: "min 4" }),
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

    it("encodes a multi-bit field given as a number", () => {
        // Field "multiA" spans bit positions 0–2; value 3 means bits 0 and 1 are set → bitmap 0b011 = 3
        expect(EncodedBitmap(MultiBitAttr, { multiA: 3 })).equals(3);
        // Field "multiB" spans bit positions 4–6; value 3 means bits 4 and 5 are set → bitmap 0b110000 = 48
        expect(EncodedBitmap(MultiBitAttr, { multiB: 3 })).equals(48);
    });

    it("encodes a multi-bit field above MAX_SAFE_INTEGER as a bigint", () => {
        const value = 2n ** 53n + 1n;
        expect(EncodedBitmap(LargeBitmapAttr, { largeBits: value })).equals(value);
    });

    it("encodes the top bit of a multi-bit numeric field", () => {
        expect(EncodedBitmap(MultiBitAttr, { multiA: 7 })).equals(0b111);
        expect(EncodedBitmap(MultiBitAttr, { multiB: 7 })).equals(0b1110000);
    });

    it("encodes the top bit of a multi-bit bigint field", () => {
        const value = 2n ** 56n;
        expect(EncodedBitmap(LargeBitmapAttr, { largeBits: value })).equals(value);
    });

    it("places a multi-bit bigint field at its lowest bit", () => {
        const value = 2n ** 54n + 1n;
        expect(EncodedBitmap(ShiftedLargeBitmapAttr, { highBits: value })).equals(value << 4n);
    });

    it("encodes a numeric multi-bit field beyond 32 bits", () => {
        expect(EncodedBitmap(LargeBitmapAttr, { largeBits: 2 ** 40 })).equals(2 ** 40);
    });

    it("encodes a bitmap whose datatype the cluster inherits, given the cluster's scope", () => {
        const dishwasherAlarm = Matter.clusters.require("DishwasherAlarm");
        const mask = dishwasherAlarm.commands.require("ModifyEnabledAlarms").fields.require("Mask");
        expect(EncodedBitmap(mask, { inflowError: true, doorError: true }, Scope(dishwasherAlarm))).equals(0b101);
    });
});

describe("EncodedBitmap and DecodedBitmap", () => {
    it("place a member with no upper bound from its lowest bit and read it back", () => {
        expect(EncodedBitmap(OpenBitmapAttr, { flag: true, rest: 5 })).equals(0b1010001);
        expect(DecodedBitmap(OpenBitmapAttr, 0b1010001)).deep.equals({ flag: true, rest: 5 });
    });
});

describe("DecodedBitmap", () => {
    it("decodes flags and multi-bit fields", () => {
        expect(DecodedBitmap(BitmapAttr, 0b101)).deep.equals({ flagA: true, flagC: true });
        expect(DecodedBitmap(MultiBitAttr, 0b1110111)).deep.equals({ multiA: 7, multiB: 7 });
    });

    it("decodes a field above bit 31", () => {
        expect(DecodedBitmap(ShiftedLargeBitmapAttr, 2 ** 40)).deep.equals({ highBits: 2 ** 36 });
    });

    it("decodes a field a number cannot hold exactly as a bigint", () => {
        expect(DecodedBitmap(LargeBitmapAttr, 2n ** 56n + 1n)).deep.equals({ largeBits: 2n ** 56n + 1n });
    });

    it("decodes a bitmap whose datatype the cluster inherits, given the cluster's scope", () => {
        const dishwasherAlarm = Matter.clusters.require("DishwasherAlarm");
        const mask = dishwasherAlarm.commands.require("ModifyEnabledAlarms").fields.require("Mask");
        expect(DecodedBitmap(mask, 0b101, Scope(dishwasherAlarm))).deep.equals({ inflowError: true, doorError: true });
    });

    it("keys FeatureMap features by their title", () => {
        expect(DecodedBitmap(FeatureMapAttr as unknown as AttributeModel, 0b11)).deep.equals({
            latchingSwitch: true,
            momentarySwitch: true,
        });
    });

    it("names every member, clear ones as false or 0, when asked for a complete object", () => {
        expect(DecodedBitmap(MultiBitAttr, 0b0010000, undefined, { complete: true })).deep.equals({
            multiA: 0,
            multiB: 1,
        });
        expect(DecodedBitmap(BitmapAttr, 0, undefined, { complete: true })).deep.equals({
            flagA: false,
            flagB: false,
            flagC: false,
        });
    });

    it("names a clear member with no upper bound in a complete object", () => {
        expect(DecodedBitmap(OpenBitmapAttr, 0, undefined, { complete: true })).deep.equals({ flag: false, rest: 0 });
        expect(DecodedBitmap(OpenBitmapAttr, 1, undefined, { complete: true })).deep.equals({ flag: true, rest: 0 });
    });
});
