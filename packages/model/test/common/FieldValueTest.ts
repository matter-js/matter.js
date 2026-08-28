/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FieldValue, Metatype } from "#common/index.js";
import { Seconds } from "@matter/general";

describe("FieldValue", () => {
    describe("countValue", () => {
        // A length, a bit position and a count are bounded by what a message carries
        it("states a magnitude only a bigint holds as a number", () => {
            expect(FieldValue.countValue(18446744073709551615n)).equal(18446744073709552000);
            expect(FieldValue.numericValue(18446744073709551615n)).equal(18446744073709551615n);
        });

        it("leaves everything else as numericValue reads it", () => {
            expect(FieldValue.countValue(5)).equal(5);
            expect(FieldValue.countValue(undefined)).undefined;
            expect(FieldValue.countValue(true)).equal(1);
        });
    });

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

        it("reads a duration the way Duration does", () => {
            expect(FieldValue.cast(Metatype.duration, 2000)).equals(Seconds(2));
            expect(FieldValue.cast(Metatype.duration, "2s")).equals(Seconds(2));
            expect(FieldValue.cast(Metatype.duration, "nonsense")).equals(FieldValue.Invalid);
        });

        // A map64 states values a number cannot hold
        it("keeps the magnitude of a bitmap value", () => {
            expect(FieldValue.cast(Metatype.bitmap, "18446744073709551615")).equal(18446744073709551615n);
            expect(FieldValue.cast(Metatype.bitmap, "0xFFFFFFFFFFFFFFFF")).equal(18446744073709551615n);
            expect(FieldValue.cast(Metatype.bitmap, "5")).equal(5);
        });

        // A fraction is not the name of a member, so refusing it says what is wrong
        it("refuses a number a bitmap cannot hold", () => {
            for (const value of ["5.5", 1.5, NaN, Infinity]) {
                expect(FieldValue.cast(Metatype.bitmap, value), String(value)).equal(FieldValue.Invalid);
                expect(FieldValue.cast(Metatype.enum, value), String(value)).equal(FieldValue.Invalid);
            }
        });

        // The value of a bitmap or enum is a number of the type it encodes to, so it reads the way that type reads
        it("reads a bitmap value the way an integer reads", () => {
            expect(FieldValue.cast(Metatype.bitmap, "1e3")).equal(1000);
            expect(FieldValue.cast(Metatype.integer, "1e3")).equal(1000);
        });

        it("still reads the name of an enum value", () => {
            expect(FieldValue.cast(Metatype.enum, "SomeName")).equal("SomeName");
            expect(FieldValue.cast(Metatype.enum, 3)).equal(3);
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
