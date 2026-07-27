/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeElement, ClusterModel, FeatureSelectionErrors, FieldElement, Matter } from "#index.js";

function clusterWith(features: { name: string; conformance?: string; title?: string }[], supported: string[]) {
    const cluster = new ClusterModel(
        { id: 0xfff1_fc01, name: "TestCluster" },
        AttributeElement(
            { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
            ...features.map((feature, index) =>
                FieldElement({
                    name: feature.name,
                    title: feature.title ?? feature.name,
                    conformance: feature.conformance,
                    constraint: `${index}`,
                }),
            ),
        ),
    );

    cluster.supportedFeatures = supported;

    return cluster;
}

function messagesFor(features: { name: string; conformance?: string; title?: string }[], supported: string[]) {
    return FeatureSelectionErrors(clusterWith(features, supported));
}

const EXCLUSIVE_CHOICE = [
    { name: "AA", conformance: "O.a" },
    { name: "BB", conformance: "O.a" },
];

const OPEN_CHOICE = [
    { name: "AA", conformance: "O.a+" },
    { name: "BB", conformance: "O.a+" },
];

describe("FeatureSelectionErrors", () => {
    describe("choice conformance", () => {
        it("requires a selection from an exactly-one group", () => {
            expect(messagesFor(EXCLUSIVE_CHOICE, [])).deep.equals(["select exactly 1 of AA, BB (0 selected)"]);
        });

        it("accepts one member of an exactly-one group", () => {
            expect(messagesFor(EXCLUSIVE_CHOICE, ["AA"])).deep.equals([]);
        });

        it("rejects two members of an exactly-one group", () => {
            expect(messagesFor(EXCLUSIVE_CHOICE, ["AA", "BB"])).deep.equals([
                "select exactly 1 of AA, BB (2 selected)",
            ]);
        });

        it("requires a selection from an at-least-one group", () => {
            expect(messagesFor(OPEN_CHOICE, [])).deep.equals(["select at least 1 of AA, BB (0 selected)"]);
        });

        it("accepts every member of an at-least-one group", () => {
            expect(messagesFor(OPEN_CHOICE, ["AA", "BB"])).deep.equals([]);
        });
    });

    describe("dependent conformance", () => {
        const DEPENDENT = [
            { name: "AA", conformance: "BB, O" },
            { name: "BB", conformance: "O" },
            { name: "CC", conformance: "[BB]" },
        ];

        it("requires a feature that another selected feature mandates", () => {
            expect(messagesFor(DEPENDENT, ["BB"])).deep.equals([
                "feature AA is mandatory for the selected features but is not selected",
            ]);
        });

        it("accepts the mandated feature when selected", () => {
            expect(messagesFor(DEPENDENT, ["AA", "BB"])).deep.equals([]);
        });

        it("accepts an optional feature on its own", () => {
            expect(messagesFor(DEPENDENT, ["AA"])).deep.equals([]);
        });

        it("rejects a feature whose gating feature is absent", () => {
            expect(messagesFor(DEPENDENT, ["CC"])).deep.equals([
                "feature CC is not allowed with the selected features",
            ]);
        });
    });

    describe("conformance we do not constrain", () => {
        it("allows a provisional feature", () => {
            expect(messagesFor([{ name: "AA", conformance: "P" }], ["AA"])).deep.equals([]);
        });

        it("allows a deprecated feature", () => {
            expect(messagesFor([{ name: "AA", conformance: "D" }], ["AA"])).deep.equals([]);
        });

        it("ignores a choice it cannot evaluate rather than throwing", () => {
            expect(() =>
                messagesFor(
                    [
                        { name: "AA", conformance: "[AA1.a]" },
                        { name: "BB", conformance: "O.a | AA" },
                    ],
                    ["AA"],
                ),
            ).not.throws();
        });
    });

    describe("choice cardinality declared inconsistently", () => {
        const mixed = [
            { name: "AA", conformance: "O.a" },
            { name: "BB", conformance: "O.a+" },
        ];

        const mixedReversed = [
            { name: "AA", conformance: "O.a+" },
            { name: "BB", conformance: "O.a" },
        ];

        it("does not depend on declaration order", () => {
            expect(messagesFor(mixed, ["AA", "BB"])).deep.equals(messagesFor(mixedReversed, ["AA", "BB"]));
            expect(messagesFor(mixed, ["AA", "BB"])).deep.equals([]);
        });
    });

    describe("otherwise groups", () => {
        it("ignores a choice in a branch that does not govern", () => {
            const features = [
                { name: "AA", conformance: "O" },
                { name: "BB", conformance: "AA, O.b" },
                { name: "CC", conformance: "O.b" },
            ];

            expect(messagesFor(features, ["AA", "BB", "CC"])).deep.equals([]);
        });
    });

    describe("standard clusters", () => {
        function errorsFor(name: string, supported: string[]) {
            const cluster = Matter.get(ClusterModel, name)!.clone();
            cluster.supportedFeatures = supported;
            return FeatureSelectionErrors(cluster);
        }

        it("requires exactly one PowerSource power type", () => {
            expect(errorsFor("PowerSource", [])).deep.equals(["select exactly 1 of Wired, Battery (0 selected)"]);
            expect(errorsFor("PowerSource", ["WIRED", "BAT"])).deep.equals([
                "select exactly 1 of Wired, Battery (2 selected)",
            ]);
            expect(errorsFor("PowerSource", ["BAT"])).deep.equals([]);
        });

        it("requires at least one Thermostat mode", () => {
            expect(errorsFor("Thermostat", [])).deep.equals(["select at least 1 of Heating, Cooling (0 selected)"]);
            expect(errorsFor("Thermostat", ["HEAT"])).deep.equals([]);
        });

        it("requires CheckInProtocolSupport and UserActiveModeTrigger for a LIT ICD", () => {
            expect(errorsFor("IcdManagement", ["LITS"])).deep.equals([
                "feature CheckInProtocolSupport is mandatory for the selected features but is not selected",
                "feature UserActiveModeTrigger is mandatory for the selected features but is not selected",
            ]);
            expect(errorsFor("IcdManagement", ["LITS", "CIP", "UAT"])).deep.equals([]);
        });

        it("rejects DynamicSitLitSupport without LongIdleTimeSupport", () => {
            expect(errorsFor("IcdManagement", ["CIP", "DSLS"])).deep.equals([
                "feature DynamicSitLitSupport is not allowed with the selected features",
            ]);
        });

        it("accepts clusters whose features are all independently optional", () => {
            expect(errorsFor("ColorControl", [])).deep.equals([]);
            expect(errorsFor("DoorLock", [])).deep.equals([]);
            expect(errorsFor("LevelControl", [])).deep.equals([]);
        });
    });
});
