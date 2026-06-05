/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { addValueWithOverflow, cropValueRange, maxValue, minValue, toHex, toNumber } from "#util/Number.js";

describe("Number utilities", () => {
    describe("toNumber", () => {
        it("converts bigint and passes number through", () => {
            expect(toNumber(5n)).equal(5);
            expect(toNumber(5)).equal(5);
        });
    });

    describe("minValue / maxValue", () => {
        it("selects the extreme of two defined values", () => {
            expect(minValue(1, 2)).equal(1);
            expect(maxValue(1, 2)).equal(2);
        });

        it("falls back to the defined operand when one is undefined", () => {
            expect(minValue(undefined, 2)).equal(2);
            expect(minValue(1, undefined)).equal(1);
            expect(maxValue(undefined, 2)).equal(2);
            expect(maxValue(1, undefined)).equal(1);
        });

        it("works with bigint", () => {
            expect(minValue(5n, 2n)).equal(2n);
            expect(maxValue(5n, 2n)).equal(5n);
        });
    });

    describe("toHex", () => {
        it("pads to an even number of digits", () => {
            expect(toHex(0xff)).equal("ff");
            expect(toHex(0x0f)).equal("0f");
            expect(toHex(0x100)).equal("0100");
            expect(toHex(255n)).equal("ff");
        });
    });

    describe("cropValueRange", () => {
        it("clamps to the range", () => {
            expect(cropValueRange(5, 0, 10)).equal(5);
            expect(cropValueRange(-1, 0, 10)).equal(0);
            expect(cropValueRange(11, 0, 10)).equal(10);
        });
    });

    describe("addValueWithOverflow", () => {
        it("wraps past the maximum", () => {
            expect(addValueWithOverflow(8, 5, 0, 10)).equal(3);
        });

        it("wraps below the minimum", () => {
            expect(addValueWithOverflow(2, -5, 0, 10)).equal(7);
        });

        it("stays in range without wrapping", () => {
            expect(addValueWithOverflow(5, 2, 0, 10)).equal(7);
        });
    });
});
