/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Metatype } from "#common/index.js";
import { UnsupportedCastError } from "#common/Metatype.js";

describe("Metatype", () => {
    describe("cast to a float", () => {
        it("reads a number stated as text", () => {
            expect(Metatype.cast(Metatype.float, "25.5")).equal(25.5);
            expect(Metatype.cast(Metatype.float, "-1e3")).equal(-1000);
        });

        it("passes a number through", () => {
            expect(Metatype.cast(Metatype.float, 1.5)).equal(1.5);
            expect(Metatype.cast(Metatype.float, null)).equal(null);
        });

        // Number() reads these as 0, 1 and 0, none of which the value states
        it("refuses what states no number", () => {
            for (const value of ["", "abc", true, [], 5n]) {
                expect(() => Metatype.cast(Metatype.float, value), String(value)).throws(UnsupportedCastError);
            }
        });
    });

    describe("cast to an integer", () => {
        it("keeps a magnitude only a bigint holds", () => {
            expect(Metatype.cast(Metatype.integer, "18446744073709551615")).equal(18446744073709551615n);
            expect(Metatype.cast(Metatype.integer, "5")).equal(5);
        });

        // BigInt refuses these with a RangeError, which is not an error a caller of this can act on
        it("refuses text stating no integer with the error it states elsewhere", () => {
            for (const value of ["", "abc"]) {
                expect(() => Metatype.cast(Metatype.integer, value), JSON.stringify(value)).throws(
                    UnsupportedCastError,
                );
            }
        });
    });
});
