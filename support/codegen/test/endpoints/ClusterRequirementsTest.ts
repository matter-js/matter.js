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

describe("RequirementGenerator", () => {
    it("finds the cluster a requirement names by its ID, whatever name the requirement states", () => {
        const { file } = fixture("Idle Fixture");

        expect(file.toString()).contains("IdleFixtureServer");
    });
});

describe("ClusterRequirements", () => {
    it("mandates a feature the specification names by its title", () => {
        const requirements = requirementsOf(
            new RequirementModel({ name: "LONGIDLETIMESUPPORT", element: "feature", conformance: "M" }),
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
});
