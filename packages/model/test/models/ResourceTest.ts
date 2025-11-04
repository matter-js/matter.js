/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeModel } from "#models/AttributeModel.js";
import { ClusterModel } from "#models/ClusterModel.js";
import { MatterModel } from "#models/MatterModel.js";
import { Resource, ResourceBundle } from "#models/Resource.js";
import { FeatureMap } from "#standard/elements/models.js";

const LandingGear = new ClusterModel({
    id: 1234,
    name: "LandingGear",
    children: [
        FeatureMap.extend({
            children: [
                { tag: "field", name: "M", title: "Metric", constraint: "0" },
                { tag: "field", name: "SAE", title: "Imperial", constraint: "1" },
            ],
        }),
        new AttributeModel({ id: 0, name: "Manufacturer", type: "string", conformance: "M" }),
        new AttributeModel({ id: 1, name: "WheelDiameter", type: "uint8", conformance: "M.a" }),
        new AttributeModel({ id: 1, name: "WheelDiameter", type: "uint16", conformance: "SAE.a" }),
        new AttributeModel({ id: 2, name: "DeploymentTime", type: "uint32" }),
    ],
});

const LandingGearResource = new Resource({
    errors: [],
    asOf: "1.1",
    until: "1.2",
    matchTo: { id: 1234 },
    pics: "PLNWHL",
    description: "You need this to land",
    details: "You usually also need this to take off",
    xref: "device§104.2.4",
});

const LandingGearBundle: Resource.Named = {
    tag: "cluster",
    name: "LandingGear",

    ...LandingGearResource,

    children: [
        {
            tag: "attribute",
            name: "FeatureMap",
            description: "Life is better with features",

            children: [
                { tag: "field", name: "M", description: "Use this if you can" },
                { tag: "field", name: "SAE", description: "Use this if you must" },
            ],
        },

        {
            tag: "attribute",
            name: "WheelDiameter",
            discriminator: "M.a",
            description: "Wheel diameter in meters",
        },

        {
            tag: "attribute",
            name: "WheelDiameter",
            discriminator: "SAE.a",
            description: "Wheel diameter in inches",
        },
    ],
};

describe("Resource", () => {
    it("sets locally from properties", () => {
        const cluster = LandingGear.clone();
        for (const key in LandingGearResource) {
            (cluster as any)[key] = LandingGearResource[key as keyof Resource];
        }
        expect(cluster.resource).deep.equals(LandingGearResource);
        expect(Object.keys(cluster.resource!).length).equals(8);
    });

    it("sets locally from resource", () => {
        const cluster = LandingGear.clone();
        cluster.resource = LandingGearResource;
        for (const key in LandingGearResource) {
            expect((cluster as any)[key]).deep.equals(LandingGearResource[key as keyof Resource]);
        }
    });

    it("has correct xref", () => {
        expect(LandingGearResource.xref).deep.equals({ document: "device", section: "104.2.4" });
    });

    it("loads from bundle", () => {
        const matter = new MatterModel();
        matter.resources = new ResourceBundle();

        const cluster = LandingGear.clone();
        matter.children.push(cluster);
        expect(cluster.resource).equals(undefined);

        matter.resources.add(LandingGearBundle);

        expect(cluster.resource).deep.equals(LandingGearResource);

        expect(cluster.attributes[0].description).equals("Life is better with features");
        expect(cluster.attributes[0].fields[0].description).equals("Use this if you can");
        expect(cluster.attributes[0].fields[1].description).equals("Use this if you must");
        expect(cluster.attributes[2].description).equals("Wheel diameter in meters");
        expect(cluster.attributes[3].description).equals("Wheel diameter in inches");
    });
});
