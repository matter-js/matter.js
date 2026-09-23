/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter, ValidateModel } from "#index.js";
import {
    AttributeModel,
    ClusterModel,
    CommandModel,
    ConditionModel,
    DeviceTypeModel,
    EventModel,
    FieldModel,
    MatterModel,
    RequirementModel,
} from "#models/index.js";

/** A device type requiring the same component twice, as Battery Storage requires two electrical sensors */
function withComponents(...instances: (number | undefined)[]) {
    const Matter = new MatterModel(
        {},
        new DeviceTypeModel(
            { name: "Composite", id: 0xff01, classification: "simple" },
            ...instances.map(
                instance => new RequirementModel({ name: "PowerSource", id: 0x11, element: "deviceType", instance }),
            ),
        ),
    );
    Matter.finalize();

    return ValidateModel(Matter).errors.map(error => error.code);
}

/** A requirement that is not a component, so an instance number means nothing on it */
function withNumberedAttributes(...instances: (number | undefined)[]) {
    const Matter = new MatterModel(
        {},
        new DeviceTypeModel(
            { name: "Numbered", id: 0xff02, classification: "simple" },
            new RequirementModel(
                { name: "OnOff", id: 0x6, element: "serverCluster" },
                ...instances.map(instance => new RequirementModel({ name: "OnTime", element: "attribute", instance })),
            ),
        ),
    );
    Matter.finalize();

    return ValidateModel(Matter).errors.map(error => error.code);
}

/**
 * A device type requiring a cluster, with the given conformance on the cluster requirement and the given requirements
 * nested in it.
 *
 * The cluster has its own name so it cannot collide with a standard cluster another suite has loaded; the requirement
 * carries the id, which is what resolves it.
 */
function withClusterRequirement(conformance: string, ...nested: RequirementModel[]) {
    return withClusterRequirementErrors(conformance, ...nested).map(error => error.split(" ")[0]);
}

function withClusterRequirementErrors(conformance: string, ...nested: RequirementModel[]) {
    const Matter = new MatterModel(
        {},
        new ClusterModel(
            { name: "Switchable", id: 0xfff2 },
            new AttributeModel(
                { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
                new FieldModel({ name: "LT", constraint: "0", title: "Lighting" }),
            ),
            new AttributeModel({ name: "OnTime", id: 0x4001, type: "uint16" }),
            new CommandModel({ name: "Toggle", id: 0x2, direction: "request", response: "status" }),
            new EventModel({ name: "StateChange", id: 0x0, priority: "info" }),
        ),
        new DeviceTypeModel(
            { name: "Phantom", id: 0xff03, classification: "simple" },
            new ConditionModel({ name: "Declared" }),
            new RequirementModel({ name: "Switchable", id: 0xfff2, element: "serverCluster", conformance }, ...nested),
        ),
    );
    Matter.finalize();

    return ValidateModel(Matter).errors.map(error => `${error.code} ${error.message}`);
}

/** A device type deriving from a parent, stating the given requirement */
function withRequirement(requirement: RequirementModel) {
    const Matter = new MatterModel(
        {},
        new DeviceTypeModel({ name: "Base", classification: "base" }, new ConditionModel({ name: "Universal" })),
        new DeviceTypeModel(
            { name: "Other", id: 0xff08, classification: "simple" },
            new ConditionModel({ name: "Foreign" }),
        ),
        new DeviceTypeModel(
            { name: "Parent", id: 0xff06, classification: "simple" },
            new ConditionModel({ name: "Inherited" }),
        ),
        new DeviceTypeModel(
            { name: "Asserting", id: 0xff07, classification: "simple", type: "Parent" },
            new ConditionModel({ name: "Declared" }),
            requirement,
        ),
    );
    Matter.finalize();

    return ValidateModel(Matter).errors.map(error => error.code);
}

describe("RequirementValidator", () => {
    describe("a name a requirement's conformance references", () => {
        it("reports a name that resolves to nothing", () => {
            expect(withClusterRequirement("NoSuchCond")).deep.equals(["UNRESOLVED_CONFORMANCE_NAME"]);
        });

        it("reports a name inside an optional conformance", () => {
            expect(withClusterRequirement("[NoSuchCond]")).deep.equals(["UNRESOLVED_CONFORMANCE_NAME"]);
        });

        it("reports a name inside a choice", () => {
            expect(withClusterRequirement("[NoSuchCond].a+")).deep.equals(["UNRESOLVED_CONFORMANCE_NAME"]);
        });

        it("accepts a condition the device type declares", () => {
            expect(withClusterRequirement("[Declared].a+")).deep.equals([]);
            expect(withClusterRequirement("Phantom.Declared")).deep.equals([]);
        });

        it("reports a condition spelled other than as declared", () => {
            expect(withClusterRequirement("[DECLARED].a+")).deep.equals(["NONCANONICAL_CONFORMANCE_NAME"]);
        });

        it("reports a qualified condition spelled other than as declared", () => {
            expect(withClusterRequirement("Phantom.DECLARED")).deep.equals(["NONCANONICAL_CONFORMANCE_NAME"]);
            expect(withClusterRequirement("PHANTOM.Declared")).deep.equals(["NONCANONICAL_CONFORMANCE_NAME"]);
        });

        it("names the declared spelling, once per name", () => {
            expect(withClusterRequirementErrors("DECLARED | !DECLARED")).deep.equals([
                'NONCANONICAL_CONFORMANCE_NAME Conformance name "DECLARED" must be spelled "Declared" as declared, or evaluation never matches it',
            ]);
        });

        it("reports a feature of the cluster in the cluster requirement's own conformance", () => {
            expect(withClusterRequirement("LT")).deep.equals(["UNRESOLVED_CONFORMANCE_NAME"]);
        });

        it("resolves the right side of a comparison whose left side is a condition", () => {
            expect(withClusterRequirement("Declared == Declared")).deep.equals([]);
            expect(withClusterRequirement("Declared != NoSuchCond")).deep.equals(["UNRESOLVED_CONFORMANCE_NAME"]);
        });

        it("accepts a feature of the cluster on a nested requirement", () => {
            expect(
                withClusterRequirement(
                    "M",
                    new RequirementModel({ name: "OnTime", element: "attribute", conformance: "LT" }),
                ),
            ).deep.equals([]);
        });

        it("reports a name on a nested requirement that is neither a feature nor a condition", () => {
            expect(
                withClusterRequirement(
                    "M",
                    new RequirementModel({ name: "OnTime", element: "attribute", conformance: "NoSuchFeature" }),
                ),
            ).deep.equals(["UNRESOLVED_CONFORMANCE_NAME"]);
        });
    });

    describe("a requirement its cluster cannot satisfy", () => {
        for (const element of ["attribute", "command", "event"] as const) {
            it(`reports ${element} that the cluster does not define`, () => {
                expect(
                    withClusterRequirement(
                        "M",
                        new RequirementModel({ name: "NoSuchElement", element, conformance: "M" }),
                    ),
                ).deep.equals(["UNSATISFIABLE_REQUIREMENT"]);
            });
        }

        it("accepts elements the cluster defines", () => {
            expect(
                withClusterRequirement(
                    "M",
                    new RequirementModel({ name: "OnTime", element: "attribute", conformance: "M" }),
                    new RequirementModel({ name: "Toggle", element: "command", conformance: "M" }),
                    new RequirementModel({ name: "StateChange", element: "event", conformance: "M" }),
                ),
            ).deep.equals([]);
        });

        it("accepts a feature named by its code", () => {
            expect(
                withClusterRequirement("M", new RequirementModel({ name: "LT", element: "feature", conformance: "M" })),
            ).deep.equals([]);
        });

        // The specification's tables name a feature by its title, which is how the model states most of them
        it("accepts a feature named by its title", () => {
            expect(
                withClusterRequirement(
                    "M",
                    new RequirementModel({ name: "LIGHTING", element: "feature", conformance: "M" }),
                ),
            ).deep.equals([]);
        });

        it("reports a feature the cluster does not define", () => {
            expect(
                withClusterRequirement(
                    "M",
                    new RequirementModel({ name: "NOSUCHFEATURE", element: "feature", conformance: "M" }),
                ),
            ).deep.equals(["UNSATISFIABLE_REQUIREMENT"]);
        });

        it("accepts disallowing an element the cluster does not define", () => {
            expect(
                withClusterRequirement(
                    "M",
                    new RequirementModel({ name: "NoSuchElement", element: "attribute", conformance: "X" }),
                ),
            ).deep.equals([]);
        });
    });

    describe("a condition requirement", () => {
        for (const name of ["Declared", "Inherited", "Universal"]) {
            it(`accepts naming ${name.toLowerCase()} condition`, () => {
                expect(withRequirement(new RequirementModel({ name, element: "condition" }))).deep.equals([]);
            });
        }

        it("accepts a foreign condition named by its type", () => {
            expect(
                withRequirement(new RequirementModel({ name: "Foreign", element: "condition", type: "Other.Foreign" })),
            ).deep.equals([]);
        });

        it("reports a type that resolves to no condition only as an unknown type", () => {
            expect(
                withRequirement(
                    new RequirementModel({ name: "NoSuchCond", element: "condition", type: "Other.NoSuchCond" }),
                ),
            ).deep.equals(["TYPE_UNKNOWN"]);
        });

        it("reports a name that resolves to no condition", () => {
            expect(withRequirement(new RequirementModel({ name: "NoSuchCond", element: "condition" }))).deep.equals([
                "UNRESOLVED_CONDITION",
            ]);
        });

        it("accepts a location the specification defines", () => {
            for (const location of ["Root", "Self", "Descendant"] as const) {
                expect(
                    withRequirement(new RequirementModel({ name: "Declared", element: "condition", location })),
                ).deep.equals([]);
            }
        });

        it("reports a location the specification does not define", () => {
            const requirement = new RequirementModel({ name: "Declared", element: "condition" });
            Object.assign(requirement, { location: "Nowhere" });
            expect(withRequirement(requirement)).deep.equals(["INVALID_ENUM_KEY"]);
        });
    });

    it("reports a location on a requirement that is not a condition requirement", () => {
        expect(
            withRequirement(
                new RequirementModel({ name: "Switchable", id: 0x6, element: "serverCluster", location: "Self" }),
            ),
        ).deep.equals(["LOCATION_NOT_APPLICABLE"]);
    });

    it("accepts the standard model", () => {
        expect(ValidateModel(Matter).errors.map(error => error.code)).deep.equals([]);
    });

    describe("a component required in several instances", () => {
        it("accepts one requirement per instance", () => {
            expect(withComponents(1, 2)).deep.equals([]);
        });

        it("reports two requirements for one instance", () => {
            expect(withComponents(1, 1)).deep.equals(["DUPLICATE_CHILD", "DUPLICATE_CHILD"]);
        });

        it("reports two requirements stating no instance", () => {
            expect(withComponents(undefined, undefined)).deep.equals(["DUPLICATE_CHILD", "DUPLICATE_CHILD"]);
        });
    });

    describe("a number that is no instance number", () => {
        // The number tells two requirements apart, so one that states no instance would make requirements that are
        // the same look different
        it("reports a number that does not count from one", () => {
            expect(withComponents(0)).deep.equals(["INVALID_INSTANCE"]);
            expect(withComponents(-1)).deep.equals(["INVALID_INSTANCE"]);
            expect(withComponents(1.5)).deep.equals(["INVALID_INSTANCE"]);
            expect(withComponents(Number.NaN)).deep.equals(["INVALID_INSTANCE"]);
        });

        it("reports a value that is no number at all", () => {
            expect(withComponents("1" as unknown as number)).deep.equals(["INVALID_INSTANCE"]);
        });

        // Reporting the number is not enough: a number that states no instance must not stand in for one, or a
        // requirement carrying it escapes the check for duplicates
        it("does not let a number that is no instance hide a duplicate", () => {
            expect(withComponents(undefined, 0).sort()).deep.equals([
                "DUPLICATE_CHILD",
                "DUPLICATE_CHILD",
                "INVALID_INSTANCE",
            ]);
        });

        it("accepts the numbers the specification counts", () => {
            expect(withComponents(1)).deep.equals([]);
            expect(withComponents(2)).deep.equals([]);
        });
    });

    describe("an instance number where the specification states none", () => {
        it("reports it, and still reports the duplicate it would otherwise hide", () => {
            expect(withNumberedAttributes(1, 2)).deep.equals([
                "DUPLICATE_CHILD",
                "INSTANCE_NOT_APPLICABLE",
                "INSTANCE_NOT_APPLICABLE",
            ]);
        });

        it("accepts an attribute requirement stating no instance", () => {
            expect(withNumberedAttributes(undefined)).deep.equals([]);
        });
    });
});
