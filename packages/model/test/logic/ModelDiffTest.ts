/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeElement,
    AttributeModel,
    ClusterModel,
    ConditionModel,
    DeviceTypeModel,
    FieldModel,
    MatterModel,
    Model,
    ModelDiff,
    RequirementModel,
} from "#index.js";
import { LogFormat } from "@matter/general";

function matter(...children: (ClusterModel | DeviceTypeModel)[]) {
    return new MatterModel({ name: "Matter" }, ...children);
}

// Named apart from the standard clusters, whose resources are frozen once any suite loads them
function fixtureCluster(...children: AttributeModel[]) {
    return new ClusterModel({ name: "DiffFixture", id: 0x9c }, ...children);
}

function featureMap(...features: FieldModel[]) {
    return new AttributeModel({ name: "FeatureMap", id: 0xfffc, type: "FeatureMap" }, ...features);
}

function attribute(id: number, name: string, properties: Partial<AttributeElement> = {}) {
    return new AttributeModel({ id, name, type: "uint8", ...properties });
}

/** A device type requiring the fixture cluster, with the Base device type declaring the universal conditions */
function sensorRequiring(...requirements: RequirementModel[]) {
    return [
        new DeviceTypeModel({ name: "Base", classification: "base" }, new ConditionModel({ name: "Sit" })),
        fixtureCluster(featureMap(new FieldModel({ name: "LT", constraint: "0", title: "Lighting" }))),
        new DeviceTypeModel(
            { name: "Sensor", id: 0xff01, classification: "simple" },
            new RequirementModel(
                { name: "DiffFixture", id: 0x9c, element: "serverCluster", conformance: "M" },
                ...requirements,
            ),
        ),
    ];
}

function diff(from: Model, to: Model, depth = 10) {
    return ModelDiff(from, to, depth);
}

function changeOf(diff: ModelDiff | undefined): ModelDiff.Change {
    if (diff?.kind !== "change") {
        expect.fail(`expected a change, got ${diff?.kind}`);
    }
    return diff;
}

function childOf(diff: ModelDiff | undefined, index = 0) {
    return changeOf(diff).children?.[index];
}

/** Every changed property in the diff, keyed by the element's path */
function changedProperties(diff: ModelDiff | undefined, path = new Array<string>()): Record<string, unknown> {
    if (diff?.kind !== "change") {
        return {};
    }
    const here = [...path, diff.name];
    const result: Record<string, unknown> = diff.properties ? { [here.join(".")]: diff.properties } : {};
    for (const child of diff.children ?? []) {
        Object.assign(result, changedProperties(child, here));
    }
    return result;
}

describe("ModelDiff", () => {
    it("reports nothing for equal models", () => {
        expect(diff(matter(fixtureCluster(attribute(1, "A"))), matter(fixtureCluster(attribute(1, "A"))))).undefined;
    });

    it("reports an added and a deleted element", () => {
        const cluster = changeOf(
            childOf(diff(matter(fixtureCluster(attribute(1, "A"))), matter(fixtureCluster(attribute(2, "B"))))),
        );

        expect(cluster.children).deep.equals([
            { kind: "delete", tag: "attribute", name: "A" },
            { kind: "add", tag: "attribute", name: "B" },
        ]);
    });

    it("reports a changed property", () => {
        const cluster = changeOf(
            childOf(
                diff(
                    matter(fixtureCluster(attribute(1, "A", { constraint: "max 10" }))),
                    matter(fixtureCluster(attribute(1, "A", { constraint: "1 to 10" }))),
                ),
            ),
        );

        expect(cluster.children).deep.equals([
            {
                kind: "change",
                tag: "attribute",
                name: "A",
                properties: { constraint: { from: "max 10", to: "1 to 10" } },
                children: [],
            },
        ]);
    });

    it("reports a renamed element it matches by ID", () => {
        const cluster = changeOf(
            childOf(
                diff(
                    matter(fixtureCluster(attribute(1, "Reached"))),
                    matter(fixtureCluster(attribute(1, "ThresholdReached"))),
                ),
            ),
        );

        expect(changeOf(childOf(cluster)).properties).deep.equals({
            name: { from: "Reached", to: "ThresholdReached" },
        });
    });

    it("tells a number from a string of the same text", () => {
        expect(
            changedProperties(
                diff(
                    matter(fixtureCluster(attribute(1, "A", { default: 5 }))),
                    matter(fixtureCluster(attribute(1, "A", { default: "5" }))),
                ),
            ),
        ).deep.equals({ "Matter.DiffFixture.A": { default: { from: "5", to: "5" } } });
    });

    it("compares a structured value regardless of the order of its keys", () => {
        expect(
            diff(
                matter(
                    fixtureCluster(attribute(1, "A", { default: { type: "properties", properties: { a: 0, b: 1 } } })),
                ),
                matter(
                    fixtureCluster(attribute(1, "A", { default: { type: "properties", properties: { b: 1, a: 0 } } })),
                ),
            ),
        ).undefined;
    });

    it("ignores documentation", () => {
        expect(
            diff(
                matter(fixtureCluster(attribute(1, "A", { description: "One" }))),
                matter(fixtureCluster(attribute(1, "A", { description: "Two" }))),
            ),
        ).undefined;
    });

    describe("conformance", () => {
        function conformanceDiff(from: string, to: string) {
            return diff(
                matter(fixtureCluster(attribute(1, "A", { conformance: from }))),
                matter(fixtureCluster(attribute(1, "A", { conformance: to }))),
            );
        }

        it("reads a feature without conformance as optional", () => {
            function withFeature(conformance: string) {
                return matter(fixtureCluster(featureMap(new FieldModel({ name: "LT", constraint: "0", conformance }))));
            }

            expect(diff(withFeature(""), withFeature("O"))).undefined;
        });

        it("reports optional in place of an element without conformance", () => {
            expect(changedProperties(conformanceDiff("", "O"))).deep.equals({
                "Matter.DiffFixture.A": { conformance: { from: undefined, to: "O" } },
            });
        });

        it("reports optional in place of a requirement without conformance", () => {
            expect(
                changedProperties(
                    diff(
                        matter(...sensorRequiring(new RequirementModel({ name: "A", element: "attribute" }))),
                        matter(
                            ...sensorRequiring(
                                new RequirementModel({ name: "A", element: "attribute", conformance: "O" }),
                            ),
                        ),
                    ),
                ),
            ).deep.equals({
                "Matter.Sensor.DiffFixture.A": { conformance: { from: undefined, to: "O" } },
            });
        });

        it("states a feature's conformance as written", () => {
            function withFeature(conformance: string) {
                return matter(fixtureCluster(featureMap(new FieldModel({ name: "LT", constraint: "0", conformance }))));
            }

            expect(changedProperties(diff(withFeature(""), withFeature("M")))).deep.equals({
                "Matter.DiffFixture.FeatureMap.LT": { conformance: { from: undefined, to: "M" } },
            });
        });

        it("reads adjacent conditions of an otherwise list as their disjunction", () => {
            expect(conformanceDiff("P, HA, OI, AUD, OC & OI", "P, HA | OI | AUD | OC & OI")).undefined;
            expect(conformanceDiff("Base.Sit, Lit", "Base.Sit | Lit")).undefined;
        });

        it("reads adjacent optional conditions of an otherwise list as their optional disjunction", () => {
            expect(conformanceDiff("[AA], [BB], [CC]", "[AA | BB | CC]")).undefined;
        });

        it("joins only entries that are adjacent", () => {
            expect(conformanceDiff("A, B, O", "A | B, O")).undefined;
            expect(changedProperties(conformanceDiff("A, O, B", "A | B, O"))).deep.equals({
                "Matter.DiffFixture.A": { conformance: { from: "A, O, B", to: "A | B, O" } },
            });
        });

        it("tells apart conformances that serialize alike", () => {
            expect(conformanceDiff("A | B ^ C", "A, B ^ C")).not.undefined;
        });

        it("reads a requirement's condition as the condition is declared", () => {
            expect(
                diff(
                    matter(
                        ...sensorRequiring(
                            new RequirementModel({ name: "A", element: "attribute", conformance: "SIT" }),
                        ),
                    ),
                    matter(
                        ...sensorRequiring(
                            new RequirementModel({ name: "A", element: "attribute", conformance: "Sit" }),
                        ),
                    ),
                ),
            ).undefined;
        });
    });

    describe("feature requirement", () => {
        it("matches a feature named by its title to the feature named by its code", () => {
            expect(
                diff(
                    matter(
                        ...sensorRequiring(
                            new RequirementModel({ name: "LIGHTING", element: "feature", conformance: "M" }),
                        ),
                    ),
                    matter(
                        ...sensorRequiring(new RequirementModel({ name: "LT", element: "feature", conformance: "M" })),
                    ),
                ),
            ).undefined;
        });

        it("reports a change to a feature requirement matched by title", () => {
            const result = diff(
                matter(
                    ...sensorRequiring(
                        new RequirementModel({ name: "LIGHTING", element: "feature", conformance: "M" }),
                    ),
                ),
                matter(...sensorRequiring(new RequirementModel({ name: "LT", element: "feature", conformance: "O" }))),
            );

            const sensor = changeOf(result).children?.find(child => child.name === "Sensor");
            const cluster = changeOf(childOf(sensor));
            expect(cluster.children).deep.equals([
                {
                    kind: "change",
                    tag: "requirement",
                    name: "LT",
                    properties: { conformance: { from: "M", to: "O" } },
                    children: [],
                },
            ]);
        });
    });

    describe("depth", () => {
        it("counts added, deleted and changed children apart", () => {
            const result = diff(
                matter(fixtureCluster(attribute(1, "A"), attribute(2, "B", { constraint: "max 1" }))),
                matter(fixtureCluster(attribute(2, "B", { constraint: "max 2" }), attribute(3, "C"))),
                2,
            );

            expect(changeOf(result).children).deep.equals([
                {
                    kind: "summary",
                    tag: "cluster",
                    name: "DiffFixture",
                    properties: undefined,
                    added: { attribute: 1 },
                    deleted: { attribute: 1 },
                    changed: { attribute: 1 },
                },
            ]);
        });
    });

    describe("diagnosticOf", () => {
        it("states each changed property on a line of its own", () => {
            const result = diff(
                matter(fixtureCluster(attribute(1, "A", { constraint: "max 10", access: "RW" }))),
                matter(fixtureCluster(attribute(1, "A", { constraint: "1 to 10", access: "R V" }))),
            );

            expect(LogFormat.formats.plain(ModelDiff.diagnosticOf(result))).equals(
                [
                    "matter#Matter",
                    "  cluster#DiffFixture",
                    "    attribute#A",
                    "      constraint: max 10 → 1 to 10",
                    "      access: RW → R V",
                ].join("\n"),
            );
        });
    });
});
