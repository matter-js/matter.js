/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MATTER_EPOCH_OFFSET_S, MATTER_EPOCH_OFFSET_US } from "#tlv/TlvNumber.js";
import { TlvOfModel } from "#tlv/TlvOfModel.js";
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
