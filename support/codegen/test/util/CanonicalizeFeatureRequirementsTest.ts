/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeModel, ClusterModel, DeviceTypeModel, FieldModel, MatterModel, RequirementModel } from "#model";
import { canonicalizeFeatureRequirements } from "#util/canonicalize-feature-requirements.js";

/** The names of the requirements of a device type's single cluster requirement, after canonicalization */
function canonicalized(...requirements: RequirementModel[]) {
    const clusterRequirement = new RequirementModel(
        { name: "IcdManagement", id: 0x46, element: "serverCluster", conformance: "M" },
        ...requirements,
    );

    canonicalizeFeatureRequirements(
        fixture(new DeviceTypeModel({ name: "Sensor", id: 0xff01, classification: "simple" }, clusterRequirement)),
    );

    return clusterRequirement.requirements.map(requirement => requirement.name);
}

function fixture(deviceType: DeviceTypeModel) {
    return new MatterModel(
        { name: "Matter" },
        // Named apart from the standard clusters, whose resources are frozen once any suite loads them; a requirement
        // finds its cluster by ID
        new ClusterModel(
            { name: "IcdManagementFixture", id: 0x46 },
            new AttributeModel(
                { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
                new FieldModel({ name: "CIP", constraint: "0", title: "Check-In Protocol Support" }),
                new FieldModel({ name: "LITS", constraint: "2", title: "Long Idle Time Support" }),
                new FieldModel({ name: "TITLED", constraint: "3", title: "CIP" }),
                new FieldModel({ name: "UNTITLED", constraint: "4" }),
            ),
        ),
        deviceType,
    );
}

describe("canonicalizeFeatureRequirements", () => {
    it("names a feature the specification names by its title by the feature's code", () => {
        expect(
            canonicalized(new RequirementModel({ name: "LongIdleTimeSupport", element: "feature", conformance: "M" })),
        ).deep.equals(["LITS"]);
    });

    it("matches the title in another case and spacing", () => {
        expect(
            canonicalized(new RequirementModel({ name: "LONGIDLETIMESUPPORT", element: "feature", conformance: "M" })),
        ).deep.equals(["LITS"]);
    });

    it("spells a code in another case as the cluster declares it", () => {
        expect(canonicalized(new RequirementModel({ name: "cip", element: "feature", conformance: "M" }))).deep.equals([
            "CIP",
        ]);
    });

    it("prefers a feature's code over another feature's title", () => {
        expect(canonicalized(new RequirementModel({ name: "CIP", element: "feature", conformance: "M" }))).deep.equals([
            "CIP",
        ]);
    });

    it("names a feature required of a component device type by the feature's code", () => {
        const feature = new RequirementModel({ name: "LongIdleTimeSupport", element: "feature", conformance: "M" });
        canonicalizeFeatureRequirements(
            fixture(
                new DeviceTypeModel(
                    { name: "Composite", id: 0xff02, classification: "simple" },
                    new RequirementModel(
                        { name: "Component", id: 0xff03, element: "deviceType", conformance: "M" },
                        new RequirementModel(
                            { name: "IcdManagement", id: 0x46, element: "serverCluster", conformance: "M" },
                            feature,
                        ),
                    ),
                ),
            ),
        );
        expect(feature.name).equals("LITS");
    });

    it("leaves a name that matches no feature as written", () => {
        expect(
            canonicalized(new RequirementModel({ name: "NoSuchFeature", element: "feature", conformance: "M" })),
        ).deep.equals(["NoSuchFeature"]);
    });

    it("leaves a feature requirement of a cluster the model does not define as written", () => {
        const feature = new RequirementModel({ name: "LongIdleTimeSupport", element: "feature", conformance: "M" });
        canonicalizeFeatureRequirements(
            fixture(
                new DeviceTypeModel(
                    { name: "Sensor", id: 0xff01, classification: "simple" },
                    new RequirementModel(
                        { name: "Undefined", id: 0xfffe, element: "serverCluster", conformance: "M" },
                        feature,
                    ),
                ),
            ),
        );
        expect(feature.name).equals("LongIdleTimeSupport");
    });

    it("leaves a requirement that is not a feature requirement as written", () => {
        expect(
            canonicalized(
                new RequirementModel({ name: "LongIdleTimeSupport", element: "attribute", conformance: "M" }),
            ),
        ).deep.equals(["LongIdleTimeSupport"]);
    });
});
