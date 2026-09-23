/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeModel,
    ClusterModel,
    ConditionModel,
    DeviceTypeModel,
    FieldModel,
    MatterModel,
    RequirementModel,
} from "#model";
import { canonicalizeConditionReferences } from "#util/canonicalize-condition-references.js";

/**
 * A model shaped as the specification scrape produces it: the conditions a conformance references are declared in
 * another case, and a feature element requirement is named by the feature's title while conformance names its code.
 */
function sensorWith(...requirements: RequirementModel[]) {
    const sensor = new DeviceTypeModel(
        { name: "Sensor", id: 0xff01, classification: "simple" },
        new ConditionModel({ name: "AclExtensionCond" }),
        ...requirements,
    );

    const matter = new MatterModel(
        { name: "Matter" },
        new DeviceTypeModel(
            { name: "Base", classification: "base" },
            new ConditionModel({ name: "Sit" }),
            new ConditionModel({ name: "Lit" }),
            new ConditionModel({ name: "Node" }),
        ),
        // Named apart from the standard clusters, whose resources are frozen once any suite loads them; a requirement
        // finds its cluster by ID
        new ClusterModel(
            { name: "PowerTopologyFixture", id: 0x9c },
            new AttributeModel(
                { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
                new FieldModel({ name: "NODE", constraint: "0", title: "Node Topology" }),
            ),
        ),
        new ClusterModel(
            { name: "IcdManagementFixture", id: 0x46 },
            new AttributeModel(
                { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
                new FieldModel({ name: "LITS", constraint: "2", title: "Long Idle Time Support" }),
            ),
        ),
        sensor,
    );

    canonicalizeConditionReferences(matter);

    return sensor;
}

function cluster(name: string, id: number, conformance: string, ...children: RequirementModel[]) {
    return new RequirementModel({ name, id, element: "serverCluster", conformance }, ...children);
}

function conformanceOf(model: DeviceTypeModel, ...path: string[]) {
    let requirement: RequirementModel | undefined;
    let children = model.requirements;
    for (const name of path) {
        requirement = children.find(child => child.name === name);
        expect(requirement, `no requirement ${path.join(".")}`).instanceof(RequirementModel);
        children = requirement!.requirements;
    }
    return requirement!.toElement().conformance;
}

describe("canonicalizeConditionReferences", () => {
    it("spells a universal condition as the Base device type declares it", () => {
        const sensor = sensorWith(cluster("IcdManagement", 0x46, "SIT | LIT"));

        expect(conformanceOf(sensor, "IcdManagement")).equals("Sit | Lit");
    });

    it("spells a condition as the device type declares it", () => {
        const sensor = sensorWith(
            cluster(
                "AccessControl",
                0x1f,
                "M",
                new RequirementModel({ name: "Extension", element: "attribute", conformance: "ACLExtensionCond" }),
            ),
        );

        expect(conformanceOf(sensor, "AccessControl", "Extension")).equals("AclExtensionCond");
    });

    it("leaves a name that is a feature code of the cluster in context", () => {
        const sensor = sensorWith(
            cluster(
                "PowerTopology",
                0x9c,
                "M",
                new RequirementModel({ name: "NODETOPOLOGY", element: "feature", conformance: "M" }),
                new RequirementModel({ name: "AvailableEndpoints", element: "attribute", conformance: "NODE" }),
            ),
        );

        expect(conformanceOf(sensor, "PowerTopology", "AvailableEndpoints")).equals("NODE");
    });

    it("spells the condition in a feature requirement the specification names by title", () => {
        const sensor = sensorWith(
            cluster(
                "IcdManagement",
                0x46,
                "M",
                new RequirementModel({ name: "LONGIDLETIMESUPPORT", element: "feature", conformance: "LIT" }),
            ),
        );

        expect(conformanceOf(sensor, "IcdManagement", "LONGIDLETIMESUPPORT")).equals("Lit");
    });

    it("leaves a qualified name", () => {
        const sensor = sensorWith(cluster("Identify", 0x3, "Base.SIT"));

        expect(conformanceOf(sensor, "Identify")).equals("Base.SIT");
    });

    it("leaves a name that resolves to nothing", () => {
        const sensor = sensorWith(cluster("Identify", 0x3, "Unknown"));

        expect(conformanceOf(sensor, "Identify")).equals("Unknown");
    });

    it("leaves a conformance naming no condition as it would be emitted without the pass", () => {
        const emittedWithoutPass = cluster("Identify", 0x3, "!(Unknown | O)").toElement().conformance;

        const sensor = sensorWith(cluster("Identify", 0x3, "!(Unknown | O)"));

        expect(conformanceOf(sensor, "Identify")).equals(emittedWithoutPass);
    });

    describe("in each expression that can name a condition", () => {
        for (const [written, canonical] of [
            ["!SIT", "!Sit"],
            ["[SIT]", "[Sit]"],
            ["[SIT].a+", "[Sit].a+"],
            ["SIT, O", "Sit, O"],
            ["SIT & !LIT", "Sit & !Lit"],
        ]) {
            it(`spells ${written} as ${canonical}`, () => {
                const sensor = sensorWith(cluster("Identify", 0x3, written));

                expect(conformanceOf(sensor, "Identify")).equals(canonical);
            });
        }
    });
});
