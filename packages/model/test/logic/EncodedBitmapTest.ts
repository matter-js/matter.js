/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeModel, EncodedBitmap, FeatureMap, FieldElement as Field } from "#index.js";

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
});
