/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationOutOfBoundsError } from "#common/ValidationError.js";
import { AttributeId } from "#datatype/AttributeId.js";
import { Mei } from "#datatype/ManufacturerExtensibleIdentifier.js";

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

describe("AttributeId", () => {
    it("refuses a fractional value in the global attribute range", () => {
        expect(AttributeId.isValid(0xf000 + 0.5)).equals(false);
    });
});
