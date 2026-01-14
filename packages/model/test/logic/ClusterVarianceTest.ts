/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterElement, ClusterModel, ClusterVariance, Conformance, FeatureMap, MatterModel } from "#index.js";
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

        it("ignores provisional", () => {
            expectComponents(attrs({ name: "attr", conformance: "P, M" }), { mandatory: ["attr"] });
        });
    });

    describe("simple variance", () => {
        it("classifies mandatory by feature", () => {
            expectComponents(attrs(["FOO"], { name: "attr", conformance: "FOO" }), {
                mandatory: ["attr"],
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
    });
});

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
