/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClusterRequirements } from "#endpoints/ClusterRequirements.js";
import { EndpointFile } from "#endpoints/EndpointFile.js";
import { AttributeModel, ClusterModel, DeviceTypeModel, FieldModel, MatterModel, RequirementModel } from "#model";

/**
 * A device type requiring a cluster with the given requirements nested in it, named as the specification scrape names
 * them.
 *
 * The cluster has its own name so it cannot collide with a standard cluster another suite has loaded; the requirement
 * carries the ID, which is what resolves it.
 */
function fixture(clusterRequirementName: string, ...nested: RequirementModel[]) {
    const cluster = new ClusterModel(
        { name: "IdleFixture", id: 0xfff7 },
        new AttributeModel(
            { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
            new FieldModel({ name: "LITS", constraint: "2", title: "LongIdleTimeSupport", conformance: "O" }),
        ),
        new AttributeModel({ name: "ActiveModeThreshold", id: 0x2, type: "uint16", conformance: "O" }),
        new AttributeModel({ name: "DeviceTypeList", id: 0x3, type: "list", conformance: "O" }),
    );
    const clusterRequirement = new RequirementModel(
        { name: clusterRequirementName, id: 0xfff7, element: "serverCluster", conformance: "O" },
        ...nested,
    );
    const deviceType = new DeviceTypeModel(
        { name: "IdleSensor", id: 0xff0a, classification: "simple", revision: 1 },
        clusterRequirement,
    );
    new MatterModel({}, cluster, deviceType);

    return { cluster, clusterRequirement, file: new EndpointFile(deviceType, {}) };
}

function requirementsOf(...nested: RequirementModel[]) {
    const { cluster, clusterRequirement, file } = fixture("IdleFixture", ...nested);
    return new ClusterRequirements(file, cluster, clusterRequirement);
}

/**
 * A device type requiring the Descriptor cluster, identified by its ID under a name no loaded resource describes, with
 * the given requirements nested in it.
 */
function descriptorFixture(...nested: RequirementModel[]) {
    return descriptorFixtureAs("serverCluster", ...nested);
}

function descriptorFixtureAs(element: "serverCluster" | "clientCluster", ...nested: RequirementModel[]) {
    const descriptor = new ClusterModel(
        { name: "DescriptorFixture", id: 0x1d },
        new AttributeModel(
            { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
            new FieldModel({ name: "TAGLIST", constraint: "0", title: "TagList", conformance: "O" }),
        ),
        new AttributeModel({ name: "DeviceTypeList", id: 0x0, type: "list", conformance: "M" }),
        new AttributeModel({ name: "EndpointUniqueId", id: 0x5, type: "string", conformance: "O" }),
    );
    const deviceType = new DeviceTypeModel(
        { name: "TaggedPanel", id: 0xff0b, classification: "simple", revision: 1 },
        new RequirementModel({ name: "DescriptorFixture", id: 0x1d, element }, ...nested),
    );
    new MatterModel({}, descriptor, deviceType);

    return new EndpointFile(deviceType, {}).toString();
}

describe("RequirementGenerator", () => {
    it("finds the cluster a requirement names by its ID, whatever name the requirement states", () => {
        const { file } = fixture("Idle Fixture");

        expect(file.toString()).contains("IdleFixtureServer");
    });

    it("generates a Descriptor server with the features a device type mandates, without its DeviceTypeList", () => {
        const source = descriptorFixture(
            new RequirementModel({ name: "DeviceTypeList", element: "attribute", default: [] }),
            new RequirementModel({ name: "TAGLIST", element: "feature", conformance: "M" }),
        );

        expect(source).contains('BaseDescriptorFixtureServer.with("TagList")');
        expect(source).contains("TaggedPanelRequirements.server.mandatory.DescriptorFixture");
        expect(source).not.contains("set(");
    });

    it("generates no Descriptor server for a device type that states only its DeviceTypeList", () => {
        const source = descriptorFixture(
            new RequirementModel({ name: "DeviceTypeList", element: "attribute", default: [] }),
        );

        expect(source).not.contains("DescriptorFixtureServer");
    });

    it("generates a Descriptor server that alters an attribute requirement other than DeviceTypeList", () => {
        const source = descriptorFixture(
            new RequirementModel({ name: "DeviceTypeList", element: "attribute", default: [] }),
            new RequirementModel({ name: "EndpointUniqueId", element: "attribute", conformance: "M" }),
        );

        expect(source).match(
            /DescriptorFixtureServer = BaseDescriptorFixtureServer\s*\.alter\(\{ attributes: \{ endpointUniqueId: \{ optional: false \} \} \}\)/,
        );
        expect(source).not.contains("deviceTypeList");
        expect(source).contains("TaggedPanelRequirements.server.mandatory.DescriptorFixture");
    });

    it("generates a Descriptor client requirement instead of skipping it like an unspecialized server one", () => {
        const source = descriptorFixtureAs(
            "clientCluster",
            new RequirementModel({ name: "DeviceTypeList", element: "attribute", default: [] }),
        );

        expect(source).contains("DescriptorFixtureClient");
    });
});

describe("ClusterRequirements", () => {
    it("mandates a feature named by its code", () => {
        const requirements = requirementsOf(
            new RequirementModel({ name: "LITS", element: "feature", conformance: "M" }),
        );

        expect(requirements.mandatoryFeatureNames).deep.equals(["LITS"]);
        expect(requirements.mandatoryFeatures).deep.equals(["LongIdleTimeSupport"]);
    });

    it("mandates an attribute the cluster leaves optional", () => {
        const requirements = requirementsOf(
            new RequirementModel({ name: "ActiveModeThreshold", element: "attribute", conformance: "M" }),
        );

        expect(requirements.alterations).deep.equals({ attributes: { activeModeThreshold: { optional: false } } });
    });

    it("ingests a DeviceTypeList requirement of a cluster other than Descriptor", () => {
        const requirements = requirementsOf(
            new RequirementModel({ name: "DeviceTypeList", element: "attribute", conformance: "M" }),
        );

        expect(requirements.alterations).deep.equals({ attributes: { deviceTypeList: { optional: false } } });
    });

    it("is specialized by a default alone", () => {
        const requirements = requirementsOf(
            new RequirementModel({ name: "ActiveModeThreshold", element: "attribute", default: 300 }),
        );

        expect(requirements.defaults).deep.equals({ activeModeThreshold: 300 });
        expect(requirements.isSpecialized).true;
    });

    it("is not specialized when it states nothing beyond the cluster", () => {
        expect(requirementsOf().isSpecialized).false;
    });
});
