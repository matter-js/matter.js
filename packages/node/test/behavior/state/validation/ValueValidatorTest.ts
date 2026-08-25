/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RootSupervisor } from "#behavior/supervision/RootSupervisor.js";
import { GlobalConfig } from "#behavior/supervision/SupervisionConfig.js";
import { ValueSupervisor } from "#behavior/supervision/ValueSupervisor.js";
import {
    AttributeModel,
    ClusterModel,
    DataModelPath,
    FeatureMap,
    FieldElement as Field,
    FieldModel,
    Matter,
    MatterModel,
} from "@matter/model";
import {
    ConformanceError,
    ConstraintError,
    DatatypeError,
    EnumValueConformanceError,
    IntegerRangeError,
    Subject,
    UnknownEnumValueError,
    Val,
} from "@matter/protocol";
import { BitmapEncodedValue, FabricIndex, NodeId } from "@matter/types";

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

    describe("struct member id fallback", () => {
        // The struct validator's container is name-keyed; per the same policy StructManager applies on read, a
        // member present only at its TLV tag number must still resolve.
        const memberSchema = new FieldModel(
            { name: "Entry", type: "struct" },
            Field({ id: 1, name: "subject", type: "uint8", conformance: "M" }),
            Field({ id: 2, name: "count", type: "uint8", constraint: "0 to 10" }),
        );
        const memberValidator = RootSupervisor.for(memberSchema).validate!;
        const memberPath = { path: new DataModelPath(memberSchema.path) };
        const session = {} as ValueSupervisor.Session;

        it("throws on a constraint violation stored only at the field's id slot", () => {
            expect(() => memberValidator({ subject: 1, 2: 20 }, session, memberPath)).throws(ConstraintError);
        });

        it("satisfies conformance for a mandatory field present only at its id slot", () => {
            expect(() => memberValidator({ 1: 5 }, session, memberPath)).not.throws();
        });
    });

    describe("fabricIndex sentinel slot", () => {
        const memberSchema = new FieldModel(
            { name: "Entry", type: "struct" },
            Field({ id: 1, name: "subject", type: "uint8" }),
            Field({ id: 0xfe, name: "FabricIndex", type: "fabric-idx", constraint: "1 to 254" }),
        );
        const validator = RootSupervisor.for(memberSchema).validate!;
        const memberPath = { path: new DataModelPath(memberSchema.path) };

        function peerSession(fabricIndexOnPeer: FabricIndex | undefined) {
            return { clientPeerContext: { fabricIndexOnPeer } } as ValueSupervisor.Session;
        }

        it("substitutes in place when the sentinel is stored at the field's id slot", () => {
            const struct: Val.Struct = { subject: 5, 254: FabricIndex.OMIT_FABRIC };
            validator(struct, peerSession(FabricIndex(3)), memberPath);
            expect(struct[254]).equals(3);
            expect("fabricIndex" in struct).is.false;
        });

        it("substitutes in place when the sentinel is stored at the field's name slot", () => {
            // Characterizes pre-existing name-slot behavior; passes unchanged before and after this fix, so it is
            // not evidence for it.
            const struct: Val.Struct = { subject: 5, fabricIndex: FabricIndex.OMIT_FABRIC };
            validator(struct, peerSession(FabricIndex(3)), memberPath);
            expect(struct.fabricIndex).equals(3);
            expect(254 in struct).is.false;
        });
    });

    describe("bitmap bit conformance", () => {
        // A bit gated on a feature, mirroring ClosureControl.LatchControlModesBitmap.RemoteLatching (conformance "LT")
        function bitmapCluster(supports?: string[]) {
            const featureMap = FeatureMap.clone();
            featureMap.children = [new FieldModel({ name: "LT", title: "Latching", constraint: "0" })];

            const cluster = new ClusterModel({
                name: "Test",
                children: [
                    featureMap,
                    new AttributeModel(
                        { id: 0, name: "Modes", type: "map16" },
                        Field({ name: "ifFeature", constraint: "0", conformance: "LT" }),
                        Field({ name: "always", constraint: "1", conformance: "O" }),
                        Field({ name: "deprecated", constraint: "2", conformance: "D" }),
                        Field({ name: "choice", constraint: "3", conformance: "[LT].b+" }),
                        Field({ name: "named", constraint: "4", conformance: "Other" }),
                        Field({ name: "range", constraint: "5 to 6", conformance: "LT" }),
                        Field({ name: "never", constraint: "7", conformance: "X" }),
                        Field({ name: "unreadable", constraint: "8", conformance: "LT > 4" }),
                        Field({ name: "grouped", constraint: "9", conformance: "LT, X" }),
                    ),
                ],
            });
            cluster.supportedFeatures = supports;

            return {
                validate: RootSupervisor.for(cluster).get(cluster).validate!,
                path: { path: new DataModelPath(cluster.path) },
            };
        }

        const local = {} as ValueSupervisor.Session;
        const wire = { subject: Subject.Node({ id: NodeId(1) }) } as ValueSupervisor.Session;
        const peer = { clientPeerContext: {} } as ValueSupervisor.Session;

        it("rejects a bit gated on an unsupported feature on a local write", () => {
            const { validate, path } = bitmapCluster();

            expect(() => validate({ modes: { ifFeature: true } }, local, path)).throws(
                ConformanceError,
                // The refused value is a bit, which may sit in a command or struct field rather than an attribute
                'Validating Test.modes.ifFeature: Conformance "LT": Matter does not allow you to set this value',
            );
        });

        it("accepts the bit when the feature is supported", () => {
            const { validate, path } = bitmapCluster(["LT"]);

            expect(() => validate({ modes: { ifFeature: true } }, local, path)).not.throws();
        });

        it("accepts a bit the value leaves clear", () => {
            const { validate, path } = bitmapCluster();

            expect(() => validate({ modes: { ifFeature: false } }, local, path)).not.throws();
        });

        it("accepts a bit that states no gate", () => {
            const { validate, path } = bitmapCluster();

            expect(() => validate({ modes: { always: true } }, local, path)).not.throws();
        });

        // The runtime conformance compiler reads a lone "D" as optional for a field, so a bit reads the same way
        it("accepts a deprecated bit", () => {
            const { validate, path } = bitmapCluster();

            expect(() => validate({ modes: { deprecated: true } }, local, path)).not.throws();
        });

        it("rejects a bit whose choice is gated on an unsupported feature", () => {
            const { validate, path } = bitmapCluster();

            expect(() => validate({ modes: { choice: true } }, local, path)).throws(ConformanceError);
        });

        // Every alternative of the group resolves without a record, so the group does too
        it("rejects a bit a group disallows once its gate fails", () => {
            const { validate, path } = bitmapCluster();

            expect(() => validate({ modes: { grouped: true } }, local, path)).throws(ConformanceError);
        });

        it("rejects a bit the specification disallows", () => {
            const { validate, path } = bitmapCluster(["LT"]);

            expect(() => validate({ modes: { never: true } }, local, path)).throws(ConformanceError);
        });

        // Thermostat's RemoteSensingBitmap.OutdoorTemperature states the name of an attribute, which only a record
        // decides.  A bit has no record around it, so there is nothing to enforce
        it("accepts a bit whose conformance names something a value would decide", () => {
            const { validate, path } = bitmapCluster();

            expect(() => validate({ modes: { named: true } }, local, path)).not.throws();
        });

        // Refusing to supervise the cluster because one bit states conformance we cannot read would be worse
        it("accepts a bit whose conformance the compiler cannot read", () => {
            const { validate, path } = bitmapCluster();

            expect(() => validate({ modes: { unreadable: true } }, local, path)).not.throws();
        });

        it("judges a range of bits by whether the write sets any of them", () => {
            const { validate, path } = bitmapCluster();

            expect(() => validate({ modes: { range: 0 } }, local, path)).not.throws();
            expect(() => validate({ modes: { range: 1 } }, local, path)).throws(ConformanceError);
        });

        // OperationalStatus.Lift is an enum over two bits.  The feature gate applies to the range; the membership of
        // the enum is not a conformance and stays with the validation of the value itself
        it("judges a range of a shipped cluster by its feature alone", () => {
            const cluster = new MatterModel(Matter).get(ClusterModel, "WindowCovering")!.clone();
            cluster.supportedFeatures = ["LF", "PA_LF"];
            const attr = cluster.get(AttributeModel, "OperationalStatus")!;
            const validate = RootSupervisor.for(cluster).get(attr).validate!;
            const path = { path: new DataModelPath(attr.path) };

            expect(() => validate({ lift: 3 }, local, path)).not.throws();
            expect(() => validate({ tilt: 1 }, local, path)).throws(ConformanceError);
        });

        // A feature map states the features a conformance is judged against, so judging its own bits against them says
        // nothing.  Validated directly, because struct validation skips a global attribute
        it("does not judge the bits of a feature map", () => {
            const featureMap = FeatureMap.clone();
            featureMap.children = [
                new FieldModel({ name: "LT", title: "Latching", constraint: "0" }),
                new FieldModel({ name: "RL", title: "RemoteLatching", constraint: "1", conformance: "LT" }),
            ];
            const cluster = new ClusterModel({ name: "Test", children: [featureMap] });
            cluster.supportedFeatures = ["RL"];

            const validate = RootSupervisor.for(cluster).get(featureMap).validate!;
            const path = { path: new DataModelPath(featureMap.path) };

            expect(() => validate({ remoteLatching: true }, local, path)).not.throws();
        });

        // A child config is what the attribute's own supervision reaches, per Supervision.Config
        it("is suppressed where conformance validation is turned off for the attribute", () => {
            const { validate, path } = bitmapCluster();
            const config = new GlobalConfig();
            config.child("modes").supervision = { conformance: false };

            expect(() => validate({ modes: { ifFeature: true } }, local, { ...path, config })).not.throws();
        });

        // A peer states its own capabilities, and a controller in the field predates our reading of the conformance
        // column
        it("ignores the bit on a write from the wire", () => {
            const { validate, path } = bitmapCluster();

            expect(() => validate({ modes: { ifFeature: true } }, wire, path)).not.throws();
        });

        it("forwards the bit on a client peer write", () => {
            const { validate, path } = bitmapCluster();

            expect(() => validate({ modes: { ifFeature: true } }, peer, path)).not.throws();
        });

        // A conformance failure is forwarded for a peer write, which unwinds the validator, so the structural checks
        // must have run already
        it("still rejects a structurally invalid bit alongside a non-conformant one on a peer write", () => {
            const { validate, path } = bitmapCluster();

            expect(() => validate({ modes: { ifFeature: true, range: 99 } }, peer, path)).throws(
                DatatypeError,
                "in range of bit field",
            );
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
