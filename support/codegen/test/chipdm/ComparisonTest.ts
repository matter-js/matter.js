/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationModels } from "#chipdm/build-models.js";
import { Category, compareModels, Finding } from "#chipdm/compare.js";
import { DataModel, DmCluster, DmElement } from "#chipdm/data-model.js";
import { Access, ClusterElement, Conformance, Constraint, ElementTag, MatterElement, MatterModel } from "#model";

function models(...clusters: ClusterElement[]): ValidationModels {
    const matter = () => new MatterModel(MatterElement({ name: "Test", children: [...clusters] }));
    return { merged: matter(), unmodified: matter() };
}

function dataModel(...clusters: DmCluster[]): DataModel {
    return {
        version: "1.6",
        source: "test",
        clusters,
        baseClusters: [],
        deviceTypes: [],
        namespaces: [],
        globals: [],
        globalCommands: [],
    };
}

function cluster(id: number, name: string, ...children: DmElement[]): DmCluster {
    return { tag: ElementTag.Cluster, id, name, revision: 1, classification: "application", children };
}

function attribute(id: number, name: string, properties: Partial<DmElement> = {}): DmElement {
    return { tag: ElementTag.Attribute, id, name, children: [], ...properties };
}

function findings(dm: DataModel, ...clusters: ClusterElement[]) {
    return compareModels(models(...clusters), dm);
}

function of(findings: Finding[], property: string) {
    return findings.filter(finding => finding.property === property);
}

describe("comparison against the CHIP data model", () => {
    it("reports nothing where the models agree", () => {
        const dm = dataModel(
            cluster(
                0x101,
                "Test",
                attribute(0x0, "Level", {
                    type: "uint8",
                    conformance: new Conformance("M"),
                    access: new Access("R V"),
                }),
            ),
        );

        const result = findings(
            dm,
            ClusterElement({
                name: "Test",
                id: 0x101,
                classification: "application",
                children: [
                    {
                        tag: ElementTag.Attribute,
                        id: 0x0,
                        name: "Level",
                        type: "uint8",
                        conformance: "M",
                        access: "R V",
                    },
                ],
            }),
        );

        expect(result.filter(finding => finding.category === Category.Mismatch)).deep.equal([]);
    });

    it("reports a conformance our model does not state", () => {
        const dm = dataModel(
            cluster(0x101, "Test", attribute(0x0, "Level", { type: "uint8", conformance: new Conformance("LT") })),
        );

        const result = findings(
            dm,
            ClusterElement({
                name: "Test",
                id: 0x101,
                classification: "application",
                children: [{ tag: ElementTag.Attribute, id: 0x0, name: "Level", type: "uint8", conformance: "M" }],
            }),
        );

        const conformance = of(result, "conformance");
        expect(conformance.length).equal(1);
        expect(conformance[0].category).equal(Category.Mismatch);
        expect(conformance[0].chip).equal("lt");
        expect(conformance[0].matter).equal("m");
    });

    it("compares access facet by facet, ignoring what CHIP leaves open", () => {
        const dm = dataModel(
            cluster(0x101, "Test", attribute(0x0, "Level", { type: "uint8", access: new Access("R V") })),
        );

        // Our access states a fabric facet CHIP does not; the read facet agrees
        const result = findings(
            dm,
            ClusterElement({
                name: "Test",
                id: 0x101,
                classification: "application",
                children: [{ tag: ElementTag.Attribute, id: 0x0, name: "Level", type: "uint8", access: "R F V" }],
            }),
        );

        expect(of(result, "access rw").length).equal(0);
        expect(of(result, "access read privilege").length).equal(0);
        expect(of(result, "access fabric").length).equal(1);
    });

    it("takes a difference our overrides explain for an intended divergence", () => {
        const dm = dataModel(
            cluster(0x101, "Test", attribute(0x0, "Level", { type: "uint8", conformance: new Conformance("O") })),
        );

        const specified = ClusterElement({
            name: "Test",
            id: 0x101,
            classification: "application",
            children: [{ tag: ElementTag.Attribute, id: 0x0, name: "Level", type: "uint8", conformance: "O" }],
        });

        const overridden = ClusterElement({
            name: "Test",
            id: 0x101,
            classification: "application",
            children: [{ tag: ElementTag.Attribute, id: 0x0, name: "Level", type: "uint8", conformance: "M" }],
        });

        const result = compareModels(
            {
                merged: new MatterModel(MatterElement({ name: "Test", children: [overridden] })),
                unmodified: new MatterModel(MatterElement({ name: "Test", children: [specified] })),
            },
            dm,
        );

        const conformance = of(result, "conformance");
        expect(conformance.length).equal(1);
        expect(conformance[0].category).equal(Category.Override);
    });

    it("states a difference CHIP cannot express as tolerated", () => {
        const dm = dataModel(
            cluster(0x101, "Test", {
                tag: ElementTag.Datatype,
                name: "TestBitmap",
                type: "map8",
                children: [
                    {
                        tag: ElementTag.Field,
                        name: "Bit",
                        constraint: new Constraint({ value: 0 }),
                        conformance: new Conformance("M"),
                        children: [],
                    },
                ],
            }),
        );

        // We state no conformance for the bits of a bitmap where the specification's table has no such column
        const result = findings(
            dm,
            ClusterElement({
                name: "Test",
                id: 0x101,
                classification: "application",
                children: [
                    {
                        tag: ElementTag.Datatype,
                        name: "TestBitmap",
                        type: "map8",
                        children: [{ tag: ElementTag.Field, name: "Bit", constraint: "0" }],
                    },
                ],
            }),
        );

        const conformance = of(result, "conformance");
        expect(conformance.length).equal(1);
        expect(conformance[0].category).equal(Category.Tolerated);
    });

    it("resolves the inheritance CHIP states as a delta", () => {
        const dm: DataModel = {
            ...dataModel({
                ...cluster(0x101, "Derived", attribute(0x0, "Level", { conformance: new Conformance("O") })),
                base: "Test Base",
            }),
            baseClusters: [
                cluster(
                    0,
                    "Test Base",
                    attribute(0x0, "Level", { type: "uint8", conformance: new Conformance("M") }),
                    attribute(0x1, "Other", { type: "uint8", conformance: new Conformance("M") }),
                ),
            ],
        };

        const result = findings(
            dm,
            ClusterElement({
                name: "Derived",
                id: 0x101,
                classification: "application",
                children: [
                    { tag: ElementTag.Attribute, id: 0x0, name: "Level", type: "uint8", conformance: "O" },
                    { tag: ElementTag.Attribute, id: 0x1, name: "Other", type: "uint8", conformance: "M" },
                ],
            }),
        );

        // The base states the type of Level and the whole of Other, both of which the derived cluster inherits
        expect(result.filter(finding => finding.category === Category.Mismatch)).deep.equal([]);
    });

    it("reports the response of a command", () => {
        const dm = dataModel(
            cluster(0x101, "Test", {
                tag: ElementTag.Command,
                id: 0x0,
                name: "Go",
                direction: "request",
                response: "GoResponse",
                children: [],
            }),
        );

        const result = findings(
            dm,
            ClusterElement({
                name: "Test",
                id: 0x101,
                classification: "application",
                children: [{ tag: ElementTag.Command, id: 0x0, name: "Go", direction: "request", response: "status" }],
            }),
        );

        const response = of(result, "response");
        expect(response.length).equal(1);
        expect(response[0].chip).equal("goresponse");
        expect(response[0].matter).equal("status");
    });

    it("reports a semantic namespace only we define", () => {
        const result = findings(
            dataModel(),
            ClusterElement({ name: "Test", id: 0x101, classification: "application" }),
        );

        expect(of(result, "cluster").length).equal(1);
    });

    it("reports a cluster neither model shares with the other", () => {
        const dm = dataModel(cluster(0x101, "OnlyChip"));

        const result = findings(dm, ClusterElement({ name: "OnlyOurs", id: 0x102, classification: "application" }));

        const clusters = of(result, "cluster");
        expect(clusters.length).equal(2);
        expect(clusters.map(finding => finding.chip).sort()).deep.equal(["absent", "present"]);
    });
});
