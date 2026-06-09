/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import { AttributeModel, DataModelPath, FieldElement as Field, FieldModel } from "@matter/model";
import { DatatypeError, IntegerRangeError, Val } from "@matter/protocol";
import { BitmapEncodedValue } from "@matter/types";

describe("ValueValidator", () => {
    implementInt("uint8", 0, 0xff);
    implementInt("uint32", 0, 0xffffffff);
    implementInt("uint64", 0, 0xffffffffffffffffn);
    implementInt("int8", -128, 127);
    implementInt("int32", -2147483648, 2147483647);
    implementInt("int64", -9223372036854775808n, 9223372036854775807n);

    describe("bitmap reserved bits", () => {
        // multiA occupies bits 0–2, multiB bits 4–6; bit 3 and bit 7 are reserved.
        const schema = new AttributeModel(
            { id: 1, name: "TestBitmap", type: "map8" },
            Field({ name: "multiA", constraint: "0 to 2" }),
            Field({ name: "multiB", constraint: "4 to 6" }),
        );
        const validator = RootSupervisor.for(schema).validate!;

        function validate(encoded: number, bits: Val.Struct) {
            const value: Val.Struct = { ...bits };
            Object.defineProperty(value, BitmapEncodedValue, { value: encoded });
            validator(value, {} as ValueSupervisor.Session, { path: new DataModelPath(schema.path) });
        }

        it("accepts defined multi-bit field values", () => {
            expect(() => validate(0b0110_0101, { multiA: 5, multiB: 6 })).not.throws();
        });

        it("rejects a reserved gap bit", () => {
            expect(() => validate(0b0000_1000, { multiA: 0, multiB: 0 })).throws(
                DatatypeError,
                "is not free of reserved bits",
            );
        });

        it("rejects a reserved high bit", () => {
            expect(() => validate(0b1000_0000, { multiA: 0, multiB: 0 })).throws(
                DatatypeError,
                "is not free of reserved bits",
            );
        });

        it("skips enforcement when no encoded value is carried", () => {
            expect(() =>
                validator({ multiA: 0, multiB: 0 }, {} as ValueSupervisor.Session, {
                    path: new DataModelPath(schema.path),
                }),
            ).not.throws();
        });
    });
});

function implementInt(type: string, min: number | bigint, max: number | bigint) {
    implementIntWithNullability(type, false, min, max);
    implementIntWithNullability(type, true, min, max);
}

function implementIntWithNullability(type: string, nullable: boolean, min: number | bigint, max: number | bigint) {
    const schema = new FieldModel({ name: "foo", type });
    let name = type;
    if (nullable) {
        name = `nullable ${name}`;
        schema.quality = "X";
        if (type.startsWith("u")) {
            max--;
        } else {
            min++;
        }
    }
    const validator = RootSupervisor.for(schema).validate!;

    const tooLow = typeof min === "bigint" ? min - 1n : min - 1;
    const tooHigh = typeof max === "bigint" ? max + 1n : max + 1;

    describe(`${name} type`, () => {
        it("has validator", () => {
            expect(validator).is.not.undefined;
        });

        it("accepts 0", () => {
            expect(() => validator(0, {} as ValueSupervisor.Session, { path: new DataModelPath(schema.path) }));
        });

        if (nullable) {
            it("accepts null", () => {
                expect(() => validator(null, {} as ValueSupervisor.Session, { path: new DataModelPath(schema.path) }));
            });
        } else {
            it(`rejects null`, () => {
                expect(() =>
                    validator(null, {} as ValueSupervisor.Session, { path: new DataModelPath(schema.path) }),
                ).throws(DatatypeError, `Value "null" is not a number or bigint`);
            });
        }

        it(`accepts ${min} (min)`, () => {
            expect(() => validator(min, {} as ValueSupervisor.Session, { path: new DataModelPath(schema.path) }));
        });

        it(`accepts ${max} (max)`, () => {
            expect(() => validator(min, {} as ValueSupervisor.Session, { path: new DataModelPath(schema.path) }));
        });

        it(`rejects ${tooLow} (too low)`, () => {
            expect(() =>
                validator(tooLow, {} as ValueSupervisor.Session, { path: new DataModelPath(schema.path) }),
            ).throws(IntegerRangeError, `Value ${tooLow} is below the ${name} minimum of ${min}`);
        });

        it(`rejects ${tooHigh} (too high)`, () => {
            expect(() =>
                validator(tooHigh, {} as ValueSupervisor.Session, { path: new DataModelPath(schema.path) }),
            ).throws(IntegerRangeError, `Value ${tooHigh} is above the ${name} maximum of ${max}`);
        });
    });
}
