/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AttributeModel, ClusterModel, MatterModel, ResourceBundle, ValidateModel } from "#index.js";

// Named apart from the standard clusters, whose resources are frozen once any suite loads them
function modelWithUnknownType() {
    const broken = new AttributeModel({ name: "Broken", id: 1, type: "NoSuchType" });
    const cluster = new ClusterModel({ name: "ValidateFixture", id: 0xfff1 }, broken);
    const matter = new MatterModel({ name: "Matter" }, cluster);
    return { matter, cluster, broken };
}
function codesOf(result: ValidateModel.Result) {
    return result.errors.map(error => `${error.source} ${error.code}`);
}

describe("ValidateModel", () => {
    it("reports the same errors each time it validates a model", () => {
        const { matter } = modelWithUnknownType();

        const first = codesOf(ValidateModel(matter));
        const second = codesOf(ValidateModel(matter));

        expect(first).contains("ValidateFixture.state.broken TYPE_UNKNOWN");
        expect(second).deep.equals(first);
    });

    it("reports errors of a model whose resource comes from a frozen bundle", () => {
        const { matter, broken } = modelWithUnknownType();
        matter.resources = new ResourceBundle();
        matter.resources.add({
            tag: "cluster",
            name: "ValidateFixture",
            description: "From the bundle",
            children: [{ tag: "attribute", name: "Broken", description: "From the bundle" }],
        });
        expect(Object.isFrozen(broken.resource)).equals(true);

        expect(codesOf(ValidateModel(matter))).contains("ValidateFixture.state.broken TYPE_UNKNOWN");
    });

    it("keeps nothing of a run on the model", () => {
        const { matter, broken } = modelWithUnknownType();

        ValidateModel(matter);

        expect(broken.errors).equals(undefined);
    });

    describe("errors a model carries", () => {
        // Characterization: the deprecated error API still reaches the validation result
        it("reports an error recorded on the model beforehand", () => {
            const { matter, cluster } = modelWithUnknownType();
            cluster.error("RECORDED", "Recorded before validation");

            expect(codesOf(ValidateModel(matter))).contains("ValidateFixture RECORDED");
        });

        it("reports an error the definition states and one recorded, each once", () => {
            const stated = new AttributeModel({
                name: "Stated",
                id: 2,
                type: "uint8",
                errors: [{ code: "STATED", source: "definition", message: "Stated by the definition" }],
            });
            const matter = new MatterModel(
                { name: "Matter" },
                new ClusterModel({ name: "ValidateFixture", id: 0xfff1 }, stated),
            );
            stated.error("RECORDED", "Recorded before validation");

            const codes = ValidateModel(matter).errors.map(error => error.code);

            expect(codes.filter(code => code === "STATED")).length(1);
            expect(codes.filter(code => code === "RECORDED")).length(1);
        });

        it("keeps a recorded error on a clone without sharing it", () => {
            const { cluster } = modelWithUnknownType();
            cluster.error("RECORDED", "Recorded before cloning");

            const clone = cluster.clone();
            clone.error("CLONE", "Recorded on the clone");

            expect(clone.errors?.map(error => error.code)).deep.equals(["RECORDED", "CLONE"]);
            expect(cluster.errors?.map(error => error.code)).deep.equals(["RECORDED"]);
        });

        it("clears errors the definition states", () => {
            const model = new AttributeModel({
                name: "Stated",
                id: 2,
                type: "uint8",
                errors: [{ code: "STATED", source: "definition", message: "Stated by the definition" }],
            });

            expect(model.valid).equals(false);

            model.errors = undefined;

            expect(model.valid).equals(true);
            expect(model.errors).equals(undefined);
        });
    });
});
