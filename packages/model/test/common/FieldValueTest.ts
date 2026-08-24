/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue, Metatype } from "#common/index.js";

describe("FieldValue", () => {
    describe("cast", () => {
        it("reads the boolean the specification writes", () => {
            expect(FieldValue.cast(Metatype.boolean, "0")).equal(false);
            expect(FieldValue.cast(Metatype.boolean, "1")).equal(true);
            expect(FieldValue.cast(Metatype.boolean, "false")).equal(false);
            expect(FieldValue.cast(Metatype.boolean, "FALSE")).equal(false);
            expect(FieldValue.cast(Metatype.boolean, "true")).equal(true);
            expect(FieldValue.cast(Metatype.boolean, "no")).equal(false);
            expect(FieldValue.cast(Metatype.boolean, "off")).equal(false);
            expect(FieldValue.cast(Metatype.boolean, 0)).equal(false);
            expect(FieldValue.cast(Metatype.boolean, 1)).equal(true);
        });

        // An override states no value to remove a default; casting it to the type would state a value of that type
        it("reads no value as no value on every type", () => {
            for (const type of [
                Metatype.any,
                Metatype.object,
                Metatype.integer,
                Metatype.string,
                Metatype.boolean,
                Metatype.bytes,
                Metatype.array,
            ]) {
                expect(FieldValue.cast(type, FieldValue.None)).undefined;
            }
        });

        it("retains the fraction of a temperature", () => {
            expect(FieldValue.cast(Metatype.integer, "25.5°C")).deep.equal(FieldValue.Celsius(25.5));
            expect(FieldValue.numericValue(FieldValue.Celsius(25.5), "UnsignedTemperature")).equal(255);
        });

        it("retains the fraction of a percentage", () => {
            expect(FieldValue.cast(Metatype.integer, "0.01%")).deep.equal(FieldValue.Percent(0.01));
            expect(FieldValue.numericValue(FieldValue.Percent(0.01), "percent100ths")).equal(1);
        });

        it("rejects a temperature without a number", () => {
            expect(FieldValue.cast(Metatype.integer, "°C")).equal(FieldValue.Invalid);
        });

        it("reads a value stated in another radix", () => {
            expect(FieldValue.cast(Metatype.integer, "0x1F°C")).deep.equal(FieldValue.Celsius(31));
        });

        it("reads whitespace as no value", () => {
            expect(FieldValue.cast(Metatype.boolean, " ")).equal(false);
        });
    });

    describe("serialize", () => {
        it("states bytes as their hex", () => {
            expect(FieldValue.serialize(FieldValue.Bytes("0a1b"))).equal("0a1b");
        });
    });
});
