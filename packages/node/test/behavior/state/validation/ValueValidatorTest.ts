/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import {
    AttributeModel,
    ClusterModel,
    DataModelPath,
    FeatureMap,
    FieldElement as Field,
    FieldModel,
} from "@matter/model";
import {
    ConformanceError,
    ConstraintError,
    DatatypeError,
    EnumValueConformanceError,
    IntegerRangeError,
    UnknownEnumValueError,
    Val,
} from "@matter/protocol";
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

    describe("client peer leniency", () => {
        // Enum value gated by an unsupported feature, mirroring FanControl FanMode=Auto(5) with conformance "AUT"
        // when the peer reports FeatureMap=0 (the SwitchBot air purifier case).
        const featureMap = FeatureMap.clone();
        featureMap.children = [new FieldModel({ name: "FT", title: "Feature", constraint: "0" })];
        const enumCluster = new ClusterModel({
            name: "Test",
            children: [
                featureMap,
                new AttributeModel(
                    { id: 0, name: "Test", type: "enum8" },
                    Field({ id: 1, name: "plain" }),
                    Field({ id: 4, name: "ifFeature", conformance: "FT" }),
                ),
            ],
        });
        const enumValidator = RootSupervisor.for(enumCluster).get(enumCluster).validate!;
        const enumPath = { path: new DataModelPath(enumCluster.path) };

        // Attribute whose presence is gated by an unsupported feature, so writing it at all is non-conformant.  Used to
        // prove datatype validation still runs after a forwarded conformance failure.
        const gatedFeatureMap = FeatureMap.clone();
        gatedFeatureMap.children = [new FieldModel({ name: "FT", title: "Feature", constraint: "0" })];
        const gatedCluster = new ClusterModel({
            name: "Test",
            children: [gatedFeatureMap, new AttributeModel({ id: 0, name: "Gated", type: "uint8", conformance: "FT" })],
        });
        const gatedValidator = RootSupervisor.for(gatedCluster).get(gatedCluster).validate!;
        const gatedPath = { path: new DataModelPath(gatedCluster.path) };

        // Bitmap with a reserved gap (bit 3) and reserved high bit (bit 7).
        const bitmapSchema = new AttributeModel(
            { id: 1, name: "TestBitmap", type: "map8" },
            Field({ name: "multiA", constraint: "0 to 2" }),
            Field({ name: "multiB", constraint: "4 to 6" }),
        );
        const bitmapValidator = RootSupervisor.for(bitmapSchema).validate!;
        const bitmapPath = { path: new DataModelPath(bitmapSchema.path) };
        function reservedBitmap() {
            const value: Val.Struct = { multiA: 0, multiB: 0 };
            Object.defineProperty(value, BitmapEncodedValue, { value: 0b1000_0000 });
            return value;
        }

        const intSchema = new FieldModel({ name: "foo", type: "uint8" });
        const intValidator = RootSupervisor.for(intSchema).validate!;
        const intPath = { path: new DataModelPath(intSchema.path) };

        // Bounded integer: a value within the type but outside the schema constraint raises a ConstraintError (distinct
        // from the IntegerRangeError raised by a type-width overflow); both must stay local.
        const boundedIntSchema = new FieldModel({ name: "foo", type: "uint8", constraint: "0 to 10" });
        const boundedIntValidator = RootSupervisor.for(boundedIntSchema).validate!;
        const boundedIntPath = { path: new DataModelPath(boundedIntSchema.path) };

        const server = {} as ValueSupervisor.Session;
        const peer = { clientPeerContext: {} } as ValueSupervisor.Session;

        it("rejects a feature-gated enum value on a server write", () => {
            expect(() => enumValidator({ test: 4 }, server, enumPath)).throws(EnumValueConformanceError);
        });

        it("forwards a feature-gated enum value on a client peer write", () => {
            expect(() => enumValidator({ test: 4 }, peer, enumPath)).not.throws();
        });

        it("rejects an undefined enum value on a server write", () => {
            expect(() => enumValidator({ test: 99 }, server, enumPath)).throws(UnknownEnumValueError);
        });

        it("forwards an undefined enum value on a client peer write", () => {
            expect(() => enumValidator({ test: 99 }, peer, enumPath)).not.throws();
        });

        it("rejects reserved bitmap bits on a server write", () => {
            expect(() => bitmapValidator(reservedBitmap(), server, bitmapPath)).throws(DatatypeError);
        });

        it("forwards reserved bitmap bits on a client peer write", () => {
            expect(() => bitmapValidator(reservedBitmap(), peer, bitmapPath)).not.throws();
        });

        it("still rejects a structurally invalid bitmap field even alongside reserved bits on a peer write", () => {
            // multiA spans bits 0-2 (max 7); 99 is out of range.  A forwarded reserved-bit failure must not skip this.
            const value: Val.Struct = { multiA: 99, multiB: 0 };
            Object.defineProperty(value, BitmapEncodedValue, { value: 0b1000_0000 });
            expect(() => bitmapValidator(value, peer, bitmapPath)).throws(DatatypeError, "in range of bit field");
        });

        it("still rejects a wrong-datatype value on a client peer write", () => {
            expect(() => intValidator("nope", peer, intPath)).throws(DatatypeError);
        });

        it("still rejects a value-range constraint on a client peer write", () => {
            expect(() => intValidator(0x1ff, peer, intPath)).throws(IntegerRangeError);
        });

        it("still rejects a schema-constraint violation on a client peer write", () => {
            expect(() => boundedIntValidator(20, peer, boundedIntPath)).throws(ConstraintError);
        });

        it("rejects a feature-disallowed attribute on a server write", () => {
            expect(() => gatedValidator({ gated: 5 }, server, gatedPath)).throws(ConformanceError);
        });

        it("forwards a feature-disallowed attribute with a valid value on a client peer write", () => {
            expect(() => gatedValidator({ gated: 5 }, peer, gatedPath)).not.throws();
        });

        it("still validates datatype when a forwarded conformance failure would otherwise skip it", () => {
            expect(() => gatedValidator({ gated: "nope" }, peer, gatedPath)).throws(DatatypeError);
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
