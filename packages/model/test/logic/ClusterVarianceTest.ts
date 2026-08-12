/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "@matter/general";
import { ClusterElement, ClusterModel, ClusterVariance, Conformance, FeatureMap, MatterModel } from "#index.js";
import { IllegalFeatureCombinations } from "#logic/cluster-variance/IllegalFeatureCombinations.js";
import { InferredComponent } from "#logic/cluster-variance/InferredComponents.js";
import { VarianceCondition } from "#logic/cluster-variance/VarianceCondition.js";

describe("ClusterVariance", () => {
    describe("invariant", () => {
        it("classifies mandatory", () => {
            expectComponents(attrs({ name: "attr", conformance: "M" }), { mandatory: ["attr"] });
        });

        it("classifies optional", () => {
            expectComponents(attrs({ name: "attr", conformance: "O" }), { optional: ["attr"] });
        });

        it("classifies mandatory and optional", () => {
            expectComponents(attrs({ name: "attr1", conformance: "M" }, { name: "attr2", conformance: "O" }), {
                mandatory: ["attr1"],
                optional: ["attr2"],
            });
        });

        it("ignores deprecation", () => {
            expectComponents(attrs({ name: "attr", conformance: "D" }), { optional: ["attr"] });
        });

        it("classifies provisional as optional", () => {
            expectComponents(attrs({ name: "attr", conformance: "P, M" }), { optional: ["attr"] });
        });

        it("classifies a provisional element without intended conformance as optional", () => {
            expectComponents(attrs({ name: "attr", conformance: "P" }), { optional: ["attr"] });
        });
    });

    describe("simple variance", () => {
        it("classifies mandatory by feature", () => {
            expectComponents(attrs(["FOO"], { name: "attr", conformance: "FOO" }), {
                mandatory: ["attr"],
                condition: { allOf: ["FOO"] },
            });
        });

        it("classifies provisional by feature as optional", () => {
            expectComponents(attrs(["FOO"], { name: "attr", conformance: "P, FOO" }), {
                optional: ["attr"],
                condition: { allOf: ["FOO"] },
            });
        });

        it("classifies optional by feature", () => {
            expectComponents(attrs(["FOO"], { name: "attr", conformance: "[FOO]" }), {
                optional: ["attr"],
                condition: { allOf: ["FOO"] },
            });
        });

        it("classifies by multiple features with mandatory and optional", () => {
            expectComponents(
                attrs(
                    ["FOO", "BAR", "NOPE"],
                    { name: "attr1", conformance: "M" },
                    { name: "attr2", conformance: "FOO" },
                    { name: "attr3", conformance: "[BAR]" },
                    { name: "attr4", conformance: "[FOO]" },
                    { name: "attr5", conformance: "O" },
                    { name: "attr6", conformance: "M" },
                ),
                {
                    mandatory: ["attr1", "attr6"],
                    optional: ["attr5"],
                },
                {
                    mandatory: ["attr2"],
                    optional: ["attr4"],
                    condition: { allOf: ["FOO"] },
                },
                {
                    optional: ["attr3"],
                    condition: { allOf: ["BAR"] },
                },
            );
        });
    });

    describe("revision conformance", () => {
        it("treats bare Rev >= vN as mandatory", () => {
            expectComponents(attrs({ name: "attr", conformance: "Rev >= v3" }), { mandatory: ["attr"] });
        });

        it("treats [Rev >= vN] as optional", () => {
            expectComponents(attrs({ name: "attr", conformance: "[Rev >= v2]" }), { optional: ["attr"] });
        });

        it("treats Rev >= vN, [Rev >= vM] as mandatory", () => {
            expectComponents(attrs({ name: "attr", conformance: "Rev >= v4, [Rev >= v2]" }), {
                mandatory: ["attr"],
            });
        });

        it("strips Rev from feature conformance", () => {
            expectComponents(attrs(["FOO"], { name: "attr", conformance: "FOO, Rev >= v3" }), {
                mandatory: ["attr"],
                condition: { allOf: ["FOO"] },
            });
        });
    });

    describe("complex variance", () => {
        it("parses FOO | BAR", () => {
            expectComponents(attrs(["FOO", "BAR"], { name: "attr", conformance: "FOO | BAR" }), {
                mandatory: ["attr"],
                condition: { anyOf: ["FOO", "BAR"] },
            });
        });

        it("parses FOO & BAR", () => {
            expectComponents(attrs(["FOO", "BAR"], { name: "attr", conformance: "FOO & BAR" }), {
                mandatory: ["attr"],
                condition: { allOf: ["FOO", "BAR"] },
            });
        });

        it("parses FOO & BarBar", () => {
            expectComponents(attrs(["FOO", "BAR"], { name: "attr", conformance: "FOO & BarBar" }), {
                optional: ["attr"],
                condition: { allOf: ["FOO"] },
            });
        });

        it("parses comma otherwise-list FOO, BAR, BAZ", () => {
            expectComponents(attrs(["FOO", "BAR", "BAZ"], { name: "attr", conformance: "FOO, BAR, BAZ" }), {
                mandatory: ["attr"],
                condition: { anyOf: ["FOO", "BAR", "BAZ"] },
            });
        });

        it("parses provisional comma otherwise-list P, FOO, BAR, BAZ", () => {
            expectComponents(attrs(["FOO", "BAR", "BAZ"], { name: "attr", conformance: "P, FOO, BAR, BAZ" }), {
                optional: ["attr"],
                condition: { anyOf: ["FOO", "BAR", "BAZ"] },
            });
        });

        it("parses comma otherwise-list with a conjunction term FOO, BAR, BAZ & QUX", () => {
            expectComponents(
                attrs(["FOO", "BAR", "BAZ", "QUX"], { name: "attr", conformance: "FOO, BAR, BAZ & QUX" }),
                { mandatory: ["attr"], condition: { anyOf: ["FOO", "BAR"] } },
                { mandatory: ["attr"], condition: { allOf: ["BAZ", "QUX"] } },
            );
        });

        it("parses [FOO & !fieldRef].x+ ignoring the field reference", () => {
            expectComponents(attrs(["FOO"], { name: "attr", conformance: "[FOO & !FieldRef].b+" }), {
                optional: ["attr"],
                condition: { allOf: ["FOO"] },
            });
        });

        it("strips Rev from [Rev >= vN & FOO & !fieldRef].x+", () => {
            expectComponents(attrs(["FOO"], { name: "attr", conformance: "[Rev >= v2 & FOO & !FieldRef].b+" }), {
                optional: ["attr"],
                condition: { allOf: ["FOO"] },
            });
        });
    });

    describe("illegal feature combinations", () => {
        it("requires a feature the specification makes mandatory", () => {
            expect(illegalCombinations({ name: "FOO", conformance: "M" })).deep.equal([{ FOO: false }]);
        });

        it("allows a feature the specification leaves optional, provisional or revision gated", () => {
            expect(
                illegalCombinations(
                    { name: "FOO", conformance: "O" },
                    { name: "BAR", conformance: "P" },
                    { name: "BAZ", conformance: "Rev >= v2" },
                ),
            ).deep.equal([]);
        });

        it("disallows a feature the specification deprecates or forbids", () => {
            expect(
                illegalCombinations({ name: "FOO", conformance: "D" }, { name: "BAR", conformance: "X" }),
            ).deep.equal([{ FOO: true }, { BAR: true }]);
        });

        it("requires a feature another feature mandates", () => {
            expect(
                illegalCombinations({ name: "FOO", conformance: "O" }, { name: "BAR", conformance: "FOO" }),
            ).deep.equal([{ FOO: true, BAR: false }]);
        });

        it("requires a feature a conjunction of several features mandates", () => {
            expect(
                illegalCombinations(
                    { name: "FOO", conformance: "O" },
                    { name: "BAR", conformance: "O" },
                    { name: "BAZ", conformance: "O" },
                    { name: "QUX", conformance: "FOO & BAR & BAZ" },
                ),
            ).deep.equal([{ FOO: true, BAR: true, BAZ: true, QUX: false }]);
        });

        it("drops a rule a self-contradictory expression would carry", () => {
            expect(
                illegalCombinations({ name: "FOO", conformance: "O" }, { name: "BAR", conformance: "FOO & !FOO" }),
            ).deep.equal([]);
        });

        // OnOff: OFFONLY conformance "[!(LT | DF)]" is disallowed whenever LT or DF is enabled
        it("supports negated disjunction over features", () => {
            expect(
                illegalCombinations(
                    { name: "LT", conformance: "[!OFFONLY]" },
                    { name: "DF", conformance: "[!OFFONLY]" },
                    { name: "OFFONLY", conformance: "[!(LT | DF)]" },
                ),
            ).deep.equal([
                { LT: true, OFFONLY: true },
                { DF: true, OFFONLY: true },
            ]);
        });

        it("supports a negated disjunction of three features", () => {
            expect(
                illegalCombinations(
                    { name: "FOO", conformance: "O" },
                    { name: "BAR", conformance: "O" },
                    { name: "BAZ", conformance: "O" },
                    { name: "QUX", conformance: "[!(FOO | BAR | BAZ)]" },
                ),
            ).deep.equal([
                { QUX: true, FOO: true },
                { QUX: true, BAR: true },
                { QUX: true, BAZ: true },
            ]);
        });

        // ClosureDimension: TR and RO conformance "[PS].b" join choice set "b" only while PS is selected
        it("applies a gated choice set only where it has members", () => {
            expect(
                illegalCombinations(
                    { name: "PS", conformance: "O" },
                    { name: "TR", conformance: "[PS].b" },
                    { name: "RO", conformance: "[PS].b" },
                ),
            ).deep.equal([
                { TR: true, PS: false },
                { RO: true, PS: false },
                { TR: true, RO: true },
                { TR: false, RO: false, PS: true },
            ]);
        });

        // DeviceEnergyManagement: PFR is "[!PA].a, ..." so a later entry supersedes the gate, SFR is "[!PA].a" alone
        it("ignores a choice member gate when a later otherwise entry admits the feature", () => {
            expect(
                illegalCombinations(
                    { name: "PA", conformance: "O" },
                    { name: "STA", conformance: "O" },
                    { name: "PFR", conformance: "[!PA].a, STA, O" },
                    { name: "SFR", conformance: "[!PA].a" },
                ),
            ).deep.equal([
                { PA: true, STA: true, PFR: false },
                { SFR: true, PA: true },
                { PFR: true, SFR: true },
                { PFR: false, SFR: false, PA: false },
            ]);
        });

        it("applies an otherwise entry only where the entries before it do not", () => {
            expect(
                illegalCombinations(
                    { name: "FOO", conformance: "O" },
                    { name: "BAR", conformance: "O" },
                    { name: "BAZ", conformance: "[FOO], BAR" },
                ),
            ).deep.equal([
                { FOO: false, BAR: true, BAZ: false },
                { FOO: false, BAR: false, BAZ: true },
            ]);
        });

        it("drops an otherwise entry an unconditional entry precedes", () => {
            expect(
                illegalCombinations(
                    { name: "FOO", conformance: "O" },
                    { name: "BAR", conformance: "O" },
                    { name: "BAZ", conformance: "O, FOO, BAR" },
                ),
            ).deep.equal([]);
        });

        it("treats a failing conjunction as the disjunction of its negated conjuncts", () => {
            expect(
                illegalCombinations(
                    { name: "FOO", conformance: "O" },
                    { name: "BAR", conformance: "O" },
                    { name: "BAZ", conformance: "O" },
                    { name: "QUX", conformance: "FOO & BAR, BAZ" },
                ),
            ).deep.equal([
                { FOO: true, BAR: true, QUX: false },
                { FOO: false, BAZ: true, QUX: false },
                { BAR: false, BAZ: true, QUX: false },
                { FOO: false, BAZ: false, QUX: true },
                { BAR: false, BAZ: false, QUX: true },
            ]);
        });

        it("drops an otherwise entry rule the states reaching it contradict", () => {
            expect(
                illegalCombinations({ name: "FOO", conformance: "O" }, { name: "BAZ", conformance: "[FOO], FOO" }),
            ).deep.equal([{ FOO: false, BAZ: true }]);
        });

        // The specification allows a choice set member only optional conformance
        it("rejects a choice set whose members the expression makes mandatory", () => {
            expect(() =>
                illegalCombinations(
                    { name: "AB", conformance: "O" },
                    { name: "X", conformance: "AB.a" },
                    { name: "Y", conformance: "AB.a" },
                ),
            ).throws(InternalError);

            expect(() =>
                illegalCombinations({ name: "X", conformance: "M.a" }, { name: "Y", conformance: "M.a" }),
            ).throws(InternalError);
        });

        it("rejects a choice set an earlier otherwise entry leaves optional", () => {
            expect(() =>
                illegalCombinations(
                    { name: "FOO", conformance: "O" },
                    { name: "X", conformance: "[FOO], O.a" },
                    { name: "Y", conformance: "[FOO], O.a" },
                ),
            ).throws(InternalError);
        });

        it("applies a choice set a provisional entry follows", () => {
            expect(
                illegalCombinations(
                    { name: "FOO", conformance: "O" },
                    { name: "X", conformance: "[FOO].a, P, O" },
                    { name: "Y", conformance: "[FOO].a, P, O" },
                ),
            ).deep.equal([
                { X: true, Y: true },
                { X: false, Y: false, FOO: true },
            ]);
        });

        it("requires nothing of a choice set whose members are all provisional", () => {
            expect(
                illegalCombinations({ name: "LN", conformance: "P, O.a+" }, { name: "SD", conformance: "P, O.a+" }),
            ).deep.equal([]);
        });

        it("keeps a choice set one settled member can satisfy", () => {
            expect(
                illegalCombinations({ name: "PWRNUM", conformance: "O.a" }, { name: "WATTS", conformance: "P, O.a" }),
            ).deep.equal([
                { PWRNUM: true, WATTS: true },
                { PWRNUM: false, WATTS: false },
            ]);
        });

        it("leaves an ungated choice set unconditional", () => {
            expect(
                illegalCombinations({ name: "WI", conformance: "O.a" }, { name: "TH", conformance: "O.a" }),
            ).deep.equal([
                { WI: true, TH: true },
                { WI: false, TH: false },
            ]);
        });

        it("applies a choice set a single ungated member keeps populated", () => {
            expect(
                illegalCombinations(
                    { name: "PS", conformance: "O" },
                    { name: "TR", conformance: "[PS].b" },
                    { name: "RO", conformance: "O.b" },
                ),
            ).deep.equal([
                { TR: true, PS: false },
                { TR: true, RO: true },
                { TR: false, RO: false },
            ]);
        });

        it("applies the gate the last entry of an otherwise list carries", () => {
            expect(
                illegalCombinations(
                    { name: "PA", conformance: "O" },
                    { name: "PFR", conformance: "Rev >= v2, [!PA].a" },
                    { name: "SFR", conformance: "Rev >= v2, [!PA].a" },
                ),
            ).deep.equal([
                { PFR: true, PA: true },
                { SFR: true, PA: true },
                { PFR: true, SFR: true },
                { PFR: false, SFR: false, PA: false },
            ]);
        });

        // DeviceEnergyManagement: the "[!PA].a" set closes only where PA is selected, which the empty selection is not
        it("reports a choice set closed by a selected feature as requiring a feature selection", () => {
            expect(
                analyzeFeatures(
                    { name: "PA", conformance: "O" },
                    { name: "PFR", conformance: "[!PA].a" },
                    { name: "SFR", conformance: "[!PA].a" },
                ).requiresFeatures,
            ).equals(true);
        });

        it("reports a gated choice set as requiring no feature selection", () => {
            expect(
                analyzeFeatures(
                    { name: "FOO", conformance: "O" },
                    { name: "BAR", conformance: "[FOO].a" },
                    { name: "BAZ", conformance: "[FOO].a" },
                ).requiresFeatures,
            ).equals(false);

            expect(
                analyzeFeatures({ name: "WI", conformance: "O.a" }, { name: "TH", conformance: "O.a" })
                    .requiresFeatures,
            ).equals(true);
        });

        it("rejects a gated choice set an earlier otherwise entry makes conditional", () => {
            expect(() =>
                illegalCombinations(
                    { name: "FOO", conformance: "O" },
                    { name: "PA", conformance: "O" },
                    { name: "X", conformance: "[FOO], [!PA].a" },
                    { name: "Y", conformance: "[FOO], [!PA].a" },
                ),
            ).throws(InternalError);
        });

        it("rejects a choice set whose members close under differing conditions", () => {
            expect(() =>
                illegalCombinations(
                    { name: "FOO", conformance: "O" },
                    { name: "BAR", conformance: "O" },
                    { name: "BAZ", conformance: "[FOO].a" },
                    { name: "QUX", conformance: "[BAR].a" },
                ),
            ).throws(InternalError);
        });

        it("distributes a conjunction the disjuncts of an optional if mix in", () => {
            expect(
                illegalCombinations(
                    { name: "FOO", conformance: "O" },
                    { name: "BAR", conformance: "O" },
                    { name: "BAZ", conformance: "O" },
                    { name: "QUX", conformance: "[FOO | BAR & BAZ]" },
                ),
            ).deep.equal([
                { QUX: true, FOO: false, BAR: false },
                { QUX: true, FOO: false, BAZ: false },
            ]);
        });

        it("rejects a choice set a member joins under a compound condition", () => {
            for (const conformance of ["[A | B].a+", "[!(A & B)].a+"]) {
                expect(() =>
                    illegalCombinations(
                        { name: "A", conformance: "O" },
                        { name: "B", conformance: "O" },
                        { name: "X", conformance },
                        { name: "Y", conformance },
                    ),
                ).throws(InternalError);
            }
        });

        it("keeps a choice set a member joins under a single condition", () => {
            expect(
                illegalCombinations(
                    { name: "A", conformance: "O" },
                    { name: "X", conformance: "[A].a+" },
                    { name: "Y", conformance: "[A].a+" },
                ),
            ).deep.equal([
                { X: true, A: false },
                { Y: true, A: false },
                { X: false, Y: false, A: true },
            ]);
        });

        it("keeps both patterns a disjunction of one feature carries", () => {
            expect(
                illegalCombinations({ name: "A", conformance: "O" }, { name: "X", conformance: "A | !A" }),
            ).deep.equal([
                { A: true, X: false },
                { A: false, X: false },
            ]);
        });

        it("rejects a choice set the specification bounds from above", () => {
            expect(() =>
                illegalCombinations({ name: "X", conformance: "O.a-" }, { name: "Y", conformance: "O.a-" }),
            ).throws(InternalError);
        });

        it("rejects a choice set of more than one required member", () => {
            expect(() =>
                illegalCombinations({ name: "X", conformance: "O.a2" }, { name: "Y", conformance: "O.a2" }),
            ).throws(InternalError);
        });

        it("rejects an expression that does not test features", () => {
            expect(() =>
                illegalCombinations(
                    { name: "FOO", conformance: "O" },
                    { name: "QUX", conformance: "[Rev >= v2 & FOO]" },
                ),
            ).throws(InternalError);

            expect(() =>
                illegalCombinations({ name: "FOO", conformance: "O" }, { name: "QUX", conformance: "[FOO > 2]" }),
            ).throws(InternalError);
        });

        // CameraAvStreamManagement: ICTL conformance "[VDO | SNP]" is available while either VDO or SNP is enabled
        it("supports disjunction of two features in an optional if", () => {
            expect(
                illegalCombinations(
                    { name: "VDO", conformance: "O" },
                    { name: "SNP", conformance: "O" },
                    { name: "ICTL", conformance: "[VDO | SNP]" },
                ),
            ).deep.equal([{ ICTL: true, VDO: false, SNP: false }]);
        });

        // CameraAvSettingsUserLevelManagement: MPRESETS conformance "[MPAN | MTILT | MZOOM]" parses as nested ORs
        it("supports disjunction of three features in an optional if", () => {
            expect(
                illegalCombinations(
                    { name: "MPAN", conformance: "O" },
                    { name: "MTILT", conformance: "O" },
                    { name: "MZOOM", conformance: "O" },
                    { name: "MPRESETS", conformance: "[MPAN | MTILT | MZOOM]" },
                ),
            ).deep.equal([{ MPRESETS: true, MPAN: false, MTILT: false, MZOOM: false }]);
        });

        it("supports a negated disjunct in an optional if", () => {
            expect(
                illegalCombinations(
                    { name: "FOO", conformance: "O" },
                    { name: "BAR", conformance: "O" },
                    { name: "BAZ", conformance: "[FOO | !BAR]" },
                ),
            ).deep.equal([{ BAZ: true, FOO: false, BAR: true }]);
        });

        // Switch: MSL conformance "[MS & (MSR | AS)]" mixes conjunction with a disjunct group
        it("supports a disjunction nested in a conjunction in an optional if (characterization)", () => {
            expect(
                illegalCombinations(
                    { name: "MS", conformance: "O" },
                    { name: "MSR", conformance: "O" },
                    { name: "AS", conformance: "O" },
                    { name: "MSL", conformance: "[MS & (MSR | AS)]" },
                ),
            ).deep.equal([
                { MSL: true, MS: false },
                { MSL: true, MSR: false, AS: false },
            ]);
        });
    });
});

function analyzeFeatures(...features: { name: string; conformance: string }[]) {
    const cluster = new ClusterModel({
        id: 1,
        name: "Cluster",
        children: [
            {
                tag: "attribute",
                id: FeatureMap.id,
                name: "FeatureMap",
                type: "FeatureMap",
                children: features.map(f => ({ tag: "field", ...f })),
            },
        ],
    });
    new MatterModel({ name: "Matter", children: [cluster] });
    return IllegalFeatureCombinations(cluster);
}

function illegalCombinations(...features: { name: string; conformance: string }[]) {
    return analyzeFeatures(...features).illegal;
}

type AttributeDefinition = { name: string; conformance: Conformance.Definition } | string[];

function attrs(...definitions: AttributeDefinition[]) {
    let nextID = 1;
    return definitions.map(attr => {
        let result: ClusterElement.Child;
        if (Array.isArray(attr)) {
            result = {
                tag: "attribute",
                id: FeatureMap.id,
                name: "FeatureMap",
                type: "FeatureMap",
                children: attr.map(f => ({ tag: "field", name: f })),
            };
        } else {
            result = {
                tag: "attribute",
                id: nextID++,
                ...attr,
            };
        }
        return result;
    });
}

function analyze(children: ClusterElement.Child[]) {
    const cluster = new ClusterModel({
        id: 1,
        name: "Cluster",
        children: children,
    });
    new MatterModel({ name: "Matter", children: [cluster] });
    return ClusterVariance(cluster);
}

type ExpectedElementVariance = {
    mandatory?: string[];
    optional?: string[];
    condition?: VarianceCondition;
};

function actualToExpected(actual: ClusterVariance) {
    const components = Array<InferredComponent>();
    if (actual.base.mandatory.length || actual.base.optional.length) {
        components.push(actual.base);
    }

    components.push(...actual.components);

    return components.map(a => {
        const e = {} as ExpectedElementVariance;
        if (a.mandatory.length) {
            e.mandatory = a.mandatory.map(a => a.name);
        }
        if (a.optional.length) {
            e.optional = a.optional.map(a => a.name);
        }
        if (a.condition) {
            e.condition = a.condition;
        }
        return e;
    });
}

function expectComponents(children: ClusterElement.Child[], ...expected: ExpectedElementVariance[]) {
    const variance = analyze(children);
    const actual = actualToExpected(variance);
    expect(actual).deep.equal(expected);
}
