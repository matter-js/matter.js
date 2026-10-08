/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationOutOfBoundsError } from "#common/ValidationError.js";
import { AttributeId } from "#datatype/AttributeId.js";
import { ClusterId } from "#datatype/ClusterId.js";
import { FieldId } from "#datatype/FieldId.js";
import { Mei } from "#datatype/ManufacturerExtensibleIdentifier.js";
import { VendorId } from "#datatype/VendorId.js";

describe("Mei", () => {
    describe("fromMei", () => {
        it("splits a valid MEI into vendor prefix and type suffix", () => {
            expect(Mei.fromMei(0xfff1_fc00)).deep.equals({ vendorPrefix: 0xfff1, typeSuffix: 0xfc00 });
        });

        for (const value of [0x1_0000_0000, -1, 1.5, NaN]) {
            it(`refuses ${value}, which is not a 32-bit unsigned integer`, () => {
                expect(() => Mei.fromMei(value)).throws(ValidationOutOfBoundsError);
            });
        }
    });
});

describe("Mei.asMei", () => {
    it("names a negative vendor prefix as it was given", () => {
        expect(() => Mei.asMei(VendorId(-1, false), 0)).throws(/Invalid vendor prefix -1 for MEI/);
    });
});

describe("ClusterId", () => {
    it("names the standard range for a standard cluster ID", () => {
        expect(() => ClusterId(0x0000_8000)).throws(/standard cluster suffix must be 0x0000 - 0x7fff/);
    });

    it("names the vendor-specific range for a vendor-specific cluster ID", () => {
        expect(() => ClusterId(0xfff1_0001)).throws(/vendor-specific cluster suffix must be 0xfc00 - 0xfffe/);
    });
});

describe("FieldId", () => {
    it("refuses a fractional value in the global field range", () => {
        expect(FieldId.isValid(0xe0 + 0.5)).equals(false);
    });
});

describe("AttributeId", () => {
    it("refuses a fractional value in the global attribute range", () => {
        expect(AttributeId.isValid(0xf000 + 0.5)).equals(false);
    });
});
