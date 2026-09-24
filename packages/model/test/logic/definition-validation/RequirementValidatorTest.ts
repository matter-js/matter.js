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
        new DeviceTypeModel({ name: "PowerSource", id: 0x11, classification: "utility" }),
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
        new ClusterModel(
            { name: "Countable", id: 0x6 },
            new AttributeModel({ name: "OnTime", id: 0x4001, type: "uint16" }),
        ),
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
            new CommandModel(
                { name: "Toggle", id: 0x2, direction: "request", response: "status" },
                new FieldModel({ name: "Delay", id: 0x0, type: "uint8" }),
            ),
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
    return withRequirementErrors(requirement).map(error => error.split(" ")[0]);
}

function withRequirementErrors(requirement: RequirementModel) {
    const Matter = new MatterModel(
        {},
        new ClusterModel(
            { name: "Present", id: 0xfff4 },
            new AttributeModel({ name: "Level", id: 0x0, type: "uint8" }),
        ),
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

    return ValidateModel(Matter).errors.map(error => `${error.code} ${error.message}`);
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

        it("accepts a command field named by its command and its field", () => {
            expect(
                withClusterRequirement(
                    "M",
                    new RequirementModel({ name: "ToggleDelay", element: "commandField", conformance: "M" }),
                ),
            ).deep.equals([]);
        });

        for (const name of ["ToggleNoSuchField", "NoSuchCommandDelay", "Delay"]) {
            it(`reports command field ${name} that no command of the cluster defines`, () => {
                expect(
                    withClusterRequirement(
                        "M",
                        new RequirementModel({ name, element: "commandField", conformance: "M" }),
                    ),
                ).deep.equals(["UNSATISFIABLE_REQUIREMENT"]);
            });
        }

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

        it("reports a name that resolves to a feature rather than a condition", () => {
            expect(withClusterRequirement("M", new RequirementModel({ name: "LT", element: "condition" }))).deep.equals(
                ["UNRESOLVED_CONDITION"],
            );
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
                new RequirementModel({ name: "Present", id: 0xfff4, element: "serverCluster", location: "Self" }),
            ),
        ).deep.equals(["LOCATION_NOT_APPLICABLE"]);
    });

    describe("a cluster requirement", () => {
        for (const element of ["serverCluster", "clientCluster"] as const) {
            it(`accepts ${element} naming a cluster the model defines`, () => {
                expect(withRequirement(new RequirementModel({ name: "Present", id: 0xfff4, element }))).deep.equals([]);
            });

            it(`reports ${element} naming a cluster the model does not define`, () => {
                expect(withRequirement(new RequirementModel({ name: "Present", id: 0xfff5, element }))).deep.equals([
                    "UNRESOLVED_CLUSTER",
                ]);
            });
        }

        it("reports only the cluster, not the members nested in it", () => {
            expect(
                withRequirement(
                    new RequirementModel(
                        { name: "Absent", id: 0xfff5, element: "serverCluster" },
                        new RequirementModel({ name: "OnTime", element: "attribute", conformance: "M" }),
                    ),
                ),
            ).deep.equals(["UNRESOLVED_CLUSTER"]);
        });
    });

    describe("a requirement under a parent that cannot hold it", () => {
        it("names the member requirement and the parent it needs", () => {
            expect(
                withRequirementErrors(
                    new RequirementModel(
                        { name: "Other", element: "deviceType" },
                        new RequirementModel({ name: "OnTime", element: "attribute", conformance: "M" }),
                    ),
                ),
            ).deep.equals([
                "ILLEGAL_REQUIREMENT_PARENT attribute requirement OnTime must be parented by a server or client cluster requirement",
            ]);
        });

        it("names the cluster requirement and the parent it needs", () => {
            expect(
                withRequirementErrors(
                    new RequirementModel(
                        { name: "Present", id: 0xfff4, element: "serverCluster" },
                        new RequirementModel({ name: "Present", id: 0xfff4, element: "clientCluster" }),
                    ),
                ),
            ).deep.equals([
                "ILLEGAL_REQUIREMENT_PARENT clientCluster requirement Present must be parented by a device type or component requirement",
            ]);
        });

        it("accepts a cluster requirement in a component requirement", () => {
            expect(
                withRequirement(
                    new RequirementModel(
                        { name: "Other", element: "deviceType" },
                        new RequirementModel({ name: "Present", id: 0xfff4, element: "serverCluster" }),
                    ),
                ),
            ).deep.equals([]);
        });
    });

    describe("a cluster member requirement outside a cluster requirement", () => {
        for (const element of ["feature", "attribute", "command", "event", "commandField"] as const) {
            it(`reports ${element} nested in a component requirement`, () => {
                expect(
                    withRequirement(
                        new RequirementModel(
                            { name: "Other", element: "deviceType" },
                            new RequirementModel({ name: "Anything", element, conformance: "M" }),
                        ),
                    ),
                ).deep.equals(["ILLEGAL_REQUIREMENT_PARENT"]);
            });
        }
    });

    describe("a disallowed requirement naming something that does not exist", () => {
        for (const [element, id] of [
            ["condition", undefined],
            ["deviceType", 0xff0f],
            ["serverCluster", 0xfff5],
            ["clientCluster", 0xfff5],
        ] as const) {
            it(`accepts ${element}`, () => {
                expect(
                    withRequirement(new RequirementModel({ name: "NoSuchThing", id, element, conformance: "X" })),
                ).deep.equals([]);
            });
        }

        it("accepts commandField", () => {
            expect(
                withClusterRequirement(
                    "M",
                    new RequirementModel({ name: "ToggleNoSuchField", element: "commandField", conformance: "X" }),
                ),
            ).deep.equals([]);
        });
    });

    describe("a component requirement", () => {
        it("accepts a device type named by its ID", () => {
            expect(
                withRequirement(new RequirementModel({ name: "Renamed", id: 0xff08, element: "deviceType" })),
            ).deep.equals([]);
        });

        it("accepts a device type named by its name alone", () => {
            expect(withRequirement(new RequirementModel({ name: "Other", element: "deviceType" }))).deep.equals([]);
        });

        it("reports a device type the model does not define", () => {
            expect(
                withRequirement(new RequirementModel({ name: "Other", id: 0xff0f, element: "deviceType" })),
            ).deep.equals(["UNRESOLVED_DEVICE_TYPE"]);
        });
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
