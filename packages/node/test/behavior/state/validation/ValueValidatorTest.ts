/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import { DataModelPath, FieldModel } from "#model";
import { IntegerRangeError } from "#protocol";

describe("ValueValidator", () => {
    implementInt("uint8", 0, 0xff);
    implementInt("uint32", 0, 0xffffffff);
    implementInt("uint64", 0, 0xffffffffffffffffn);
    implementInt("int8", -127, 127);
    implementInt("int32", -2147483647, 2147483647);
    implementInt("int64", -9223372036854775807n, 9223372036854775807n);
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
            expect(() => validator(0, {} as ValueSupervisor.Session, { path: DataModelPath(schema.path) }));
        });

        it(`accepts ${min} (min)`, () => {
            expect(() => validator(min, {} as ValueSupervisor.Session, { path: DataModelPath(schema.path) }));
        });

        it(`accepts ${max} (max)`, () => {
            expect(() => validator(min, {} as ValueSupervisor.Session, { path: DataModelPath(schema.path) }));
        });

        it(`rejects ${tooLow} (too low)`, () => {
            expect(() => validator(tooLow, {} as ValueSupervisor.Session, { path: DataModelPath(schema.path) })).throws(
                IntegerRangeError,
                `Value ${tooLow} is below the ${name} minimum of ${min}`,
            );
        });

        it(`rejects ${tooHigh} (too high)`, () => {
            expect(() =>
                validator(tooHigh, {} as ValueSupervisor.Session, { path: DataModelPath(schema.path) }),
            ).throws(IntegerRangeError, `Value ${tooHigh} is above the ${name} maximum of ${max}`);
        });
    });
}
