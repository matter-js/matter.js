/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModelBounds } from "#common/ModelBounds.js";
import { MATTER_EPOCH_OFFSET_S, MATTER_EPOCH_OFFSET_US } from "#tlv/TlvNumber.js";
import { TlvOfModel } from "#tlv/TlvOfModel.js";
import { ImplementationError } from "@matter/general";
import { AttributeModel, ClusterModel, Matter, ValueModel } from "@matter/model";

const grpKeyMgmt = Matter.clusters("GroupKeyManagement")!;
const groupKeySetStruct = grpKeyMgmt.datatypes("GroupKeySetStruct")!;

describe("TlvOfModel", () => {
    describe("epoch-us fields", () => {
        const epochStartTime0 = groupKeySetStruct.members("EpochStartTime0")!;

        it("applies epoch-us offset on round-trip", () => {
            const value = MATTER_EPOCH_OFFSET_US + 1n;
            expect(roundTrip(epochStartTime0, value)).equal(value);
        });
    });

    describe("epoch-s fields", () => {
        const smokeCOAlarm = Matter.clusters("SmokeCoAlarm")!;
        const expiryDate = smokeCOAlarm.attributes("ExpiryDate")!;

        it("applies epoch-s offset on round-trip", () => {
            const value = MATTER_EPOCH_OFFSET_S + 1;
            expect(roundTrip(expiryDate, value)).equal(value);
        });
    });

    describe("struct round-trip", () => {
        it("preserves epoch-us fields in GroupKeySetStruct", () => {
            const decoded = roundTrip(groupKeySetStruct, groupKeySet()) as ReturnType<typeof groupKeySet>;
            expect(decoded.epochStartTime0).equal(MATTER_EPOCH_OFFSET_US + 1n);
            expect(decoded.epochStartTime1).equal(null);
        });
    });

    describe("struct with feature-conditional fields", () => {
        it("round-trips CumulativeEnergyResetStruct", () => {
            const eem = Matter.clusters("ElectricalEnergyMeasurement")!;
            const cumulativeEnergyReset = eem.attributes("CumulativeEnergyReset")!;
            const value = {
                importedResetTimestamp: MATTER_EPOCH_OFFSET_S + 1000,
                exportedResetTimestamp: MATTER_EPOCH_OFFSET_S + 2000,
            };
            expect(roundTrip(cumulativeEnergyReset, value)).deep.equal(value);
        });
    });

    describe("nullable quality on extended models", () => {
        // PeerBehavior.generateDiscoveredType() calls maybeOverrideSupport() for every attribute.
        // That function adds an attribute to attrSupportOverrides whenever the attribute is supported
        // AND its conformance applicability is not Mandatory (i.e. all conditional/optional attributes).
        // It then calls attr.extend({ operationalIsSupported: true }) for each override.
        // The extended model carries no local quality, so nullable must be resolved via effectiveQuality.
        // This affects ALL nullable conditional/optional attributes on peer devices — not just ones
        // where the relevant feature appears absent.
        describe("scalar (enum) attribute", () => {
            const onOff = Matter.clusters("OnOff")!;
            const startUpOnOff = onOff.attributes("StartUpOnOff")!;
            const extended = startUpOnOff.extend({ operationalIsSupported: true });

            it("round-trips null", () => {
                expect(roundTrip(extended, null)).equal(null);
            });

            it("round-trips non-null values", () => {
                expect(roundTrip(extended, 0)).equal(0);
                expect(roundTrip(extended, 2)).equal(2);
            });
        });

        describe("struct attribute", () => {
            const eem = Matter.clusters("ElectricalEnergyMeasurement")!;
            const cumulativeEnergyReset = eem.attributes("CumulativeEnergyReset")!;
            const extended = cumulativeEnergyReset.extend({ operationalIsSupported: true });

            it("round-trips null", () => {
                expect(roundTrip(extended, null)).equal(null);
            });

            it("round-trips non-null value", () => {
                const value = {
                    importedResetTimestamp: MATTER_EPOCH_OFFSET_S + 1000,
                    exportedResetTimestamp: MATTER_EPOCH_OFFSET_S + 2000,
                };
                expect(roundTrip(extended, value)).deep.equal(value);
            });
        });

        describe("non-nullable conditional attribute", () => {
            // GlobalSceneControl has conformance "LT" (conditional) but no nullable quality.
            // Extending it must NOT add TlvNullable — the fix must be precise.
            const onOff = Matter.clusters("OnOff")!;
            const globalSceneControl = onOff.attributes("GlobalSceneControl")!;
            const extended = globalSceneControl.extend({ operationalIsSupported: true });

            it("round-trips false", () => {
                expect(roundTrip(extended, false)).equal(false);
            });

            it("round-trips true", () => {
                expect(roundTrip(extended, true)).equal(true);
            });
        });
    });

    describe("unknown attribute", () => {
        it("returns TlvAny for attribute typed as any", () => {
            const model = new AttributeModel({ id: 1, name: "unknown_1", type: "any", access: "RW" });
            expect(() => TlvOfModel(model)).not.throw();
        });
    });

    describe("command round-trip", () => {
        it("preserves epoch-us fields in KeySetWrite", () => {
            const keySetWrite = grpKeyMgmt.commands("KeySetWrite")!;
            const decoded = roundTrip(keySetWrite, { groupKeySet: groupKeySet() }) as {
                groupKeySet: ReturnType<typeof groupKeySet>;
            };
            expect(decoded.groupKeySet.epochStartTime0).equal(MATTER_EPOCH_OFFSET_US + 1n);
        });
    });

    describe("a bound wider than a number states exactly", () => {
        // A bound just inside the type's own range, so the bound is the only thing that can refuse a value
        const big = new AttributeModel({ id: 1, name: "Big", type: "uint64", constraint: "0 to 18446744073709551614" });
        new ClusterModel({ name: "Test", id: 0xfff1 }, big);

        it("admits the widest value the bound states", () => {
            expect(() => TlvOfModel(big).validate(18446744073709551614n)).not.throws();
        });

        // A length counts bytes, which the size of a message bounds, so it states itself as a number
        it("states a length bound as a number", () => {
            const long = new AttributeModel({
                id: 2,
                name: "Long",
                type: "string",
                constraint: "max 18446744073709551615",
            });
            new ClusterModel({ name: "Test2", id: 0xfff2 }, long);

            expect(ModelBounds.createLengthBounds(long)).deep.equals({ maxLength: 18446744073709552000 });
        });

        it("states a magnitude beyond every number as it stands", () => {
            const beyond = new AttributeModel({
                id: 3,
                name: "Beyond",
                type: "uint64",
                constraint: `max ${"9".repeat(400)}`,
            });
            new ClusterModel({ name: "Test3", id: 0xfff3 }, beyond);

            expect(() => TlvOfModel(beyond)).not.throws();
            expect(typeof ModelBounds.createNumberBounds(beyond)?.max).equals("bigint");
        });

        it("refuses the value above it", () => {
            expect(() => TlvOfModel(big).validate(18446744073709551615n)).throws();
        });

        // 2^63 is a magnitude a number states exactly, so only the safe-integer rule keeps it a bigint
        it("states a bound beyond the safe integers as a bigint", () => {
            const exact = new AttributeModel({
                id: 4,
                name: "Exact",
                type: "uint64",
                constraint: "max 9223372036854775808",
            });
            new ClusterModel({ name: "Test4", id: 0xfff4 }, exact);

            expect(ModelBounds.createNumberBounds(exact)?.max).equals(9223372036854775808n);
            expect(() => TlvOfModel(exact).validate(9223372036854775808n)).not.throws();
            expect(() => TlvOfModel(exact).validate(9223372036854775809n)).throws();
        });

        // A constraint stating a number carries what the number holds, 2^60; one stating text carries the magnitude
        // the digits state, 24 more.  Both spell themselves "1152921504606847000"
        it("refuses a bound a number states only approximately", () => {
            const held = new AttributeModel({
                id: 5,
                name: "Held",
                type: "uint64",
                constraint: { max: 1152921504606847000 },
            });
            new ClusterModel({ name: "Test5", id: 0xfff5 }, held);

            const stated = new AttributeModel({
                id: 6,
                name: "Stated",
                type: "uint64",
                constraint: "max 1152921504606847000",
            });
            new ClusterModel({ name: "Test6", id: 0xfff6 }, stated);

            expect(ModelBounds.createNumberBounds(held)?.max).equals(1152921504606847000);
            expect(ModelBounds.createNumberBounds(stated)?.max).equals(1152921504606847000n);

            // The number lost the magnitude before the schema saw it, so there is no bound to enforce
            expect(() => TlvOfModel(held)).throws(ImplementationError, /must be a bigint/);
            expect(() => TlvOfModel(stated).validate(1152921504606846977n)).not.throws();
        });

        it("states an exact value the way it states a bound", () => {
            const wide = new AttributeModel({ id: 8, name: "Wide", type: "uint8", constraint: { value: 5n } });
            new ClusterModel({ name: "Test8", id: 0xfff8 }, wide);

            expect(ModelBounds.createNumberBounds(wide)).deep.equals({ min: 5, max: 5 });
        });

        it("keeps the bound of a nullable type that states one", () => {
            const bounded = new AttributeModel({
                id: 7,
                name: "Bounded",
                type: "int64",
                quality: "X",
                constraint: "-10000 to 10000",
            });
            new ClusterModel({ name: "Test7", id: 0xfff7 }, bounded);

            expect(() => TlvOfModel(bounded).validate(-10000n)).not.throws();
            expect(() => TlvOfModel(bounded).validate(10000n)).not.throws();
        });
    });
});

function roundTrip(model: ClusterModel | ValueModel, value: unknown) {
    const schema = TlvOfModel(model);
    return schema.decode(schema.encode(value));
}

function groupKeySet(epochStartTime0 = MATTER_EPOCH_OFFSET_US + 1n) {
    return {
        groupKeySetId: 1,
        groupKeySecurityPolicy: 0,
        epochKey0: new Uint8Array(16),
        epochStartTime0,
        epochKey1: null,
        epochStartTime1: null,
        epochKey2: null,
        epochStartTime2: null,
    };
}
