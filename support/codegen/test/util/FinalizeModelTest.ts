/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeModel,
    ClusterModel,
    ConditionModel,
    DatatypeModel,
    DeviceTypeModel,
    FieldModel,
    MatterModel,
    RequirementModel,
} from "#model";
import { finalizeModel } from "#util/finalize-model.js";

describe("finalizeModel", () => {
    it("canonicalizes the names device type requirements reference", () => {
        const feature = new RequirementModel({
            name: "LongIdleTimeSupport",
            element: "feature",
            conformance: "SENSORCOND",
        });
        const matter = new MatterModel(
            { name: "Matter" },
            new DatatypeModel({ name: "namespace", type: "uint8" }),
            // Named apart from the standard clusters, whose resources are frozen once any suite loads them
            new ClusterModel(
                { name: "IcdFixture", id: 0xfff3 },
                new AttributeModel(
                    { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
                    new FieldModel({ name: "LITS", constraint: "2", title: "Long Idle Time Support" }),
                ),
            ),
            new DeviceTypeModel(
                { name: "SensorFixture", id: 0xff01, classification: "simple" },
                new ConditionModel({ name: "SensorCond" }),
                new RequirementModel({ name: "IcdFixture", id: 0xfff3, element: "serverCluster" }, feature),
            ),
        );

        finalizeModel(matter);

        expect(feature.name).equals("LITS");
        expect(feature.toElement().conformance).equals("SensorCond");
    });

    describe("SemanticTagStruct", () => {
        // Named apart from the standard clusters, whose resources are frozen once any suite loads them
        function finalized() {
            const matter = new MatterModel(
                { name: "Matter" },
                new DatatypeModel({ name: "namespace", type: "uint8" }),
                new DatatypeModel(
                    { name: "semtag", type: "struct" },
                    new FieldModel({ name: "MfgCode", id: 0x0, type: "vendor-id" }),
                    new FieldModel({ name: "NamespaceId", id: 0x1, type: "namespace" }),
                    new FieldModel({ name: "Tag", id: 0x2, type: "uint8" }),
                ),
                new ClusterModel(
                    { name: "ModeSelectFixture", id: 0xfff1 },
                    new DatatypeModel(
                        { name: "SemanticTagStruct", type: "struct" },
                        new FieldModel({ name: "MfgCode", id: 0x0, type: "vendor-id" }),
                        new FieldModel({ name: "Value", id: 0x1, type: "uint16" }),
                    ),
                    new AttributeModel({ name: "OwnTag", id: 0x0, type: "SemanticTagStruct" }),
                ),
                new ClusterModel(
                    { name: "SensingFixture", id: 0xfff2 },
                    new AttributeModel(
                        { name: "Sensed", id: 0x0, type: "list" },
                        new FieldModel({ name: "entry", type: "SemanticTagStruct" }),
                    ),
                ),
            );

            finalizeModel(matter);

            return matter;
        }

        it("binds a cluster without its own SemanticTagStruct to the global semtag", () => {
            const entry = finalized().clusters("SensingFixture")?.attributes("Sensed")?.children[0];
            expect(entry?.type).equals("semtag");
        });

        it("keeps a cluster's own SemanticTagStruct", () => {
            expect(finalized().clusters("ModeSelectFixture")?.attributes("OwnTag")?.type).equals("SemanticTagStruct");
        });
    });
});
