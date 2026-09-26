/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AcknowledgedRemovals } from "#acknowledged-removals.js";
import { ClusterModel, DeviceTypeModel, MatterModel, RequirementModel } from "#model";
import "@matter/model/resources";
import { digestOf, findLosses, ModelDigest } from "#util/model-digest.js";

function model(...clusters: ConstructorParameters<typeof ClusterModel>[0][]) {
    return new MatterModel({ name: "Matter", children: clusters.map(c => new ClusterModel(c)) });
}

function digest(...clusters: ConstructorParameters<typeof ClusterModel>[0][]) {
    return digestOf(model(...clusters));
}

const WITH_ATTRIBUTE = {
    name: "Test",
    id: 0x101,
    children: [{ tag: "attribute", name: "Thing", id: 0x1, constraint: "1 to 4", default: 2 }],
} as ConstructorParameters<typeof ClusterModel>[0];

describe("model digest", () => {
    it("keys an element by where it sits, and by its identifier where it has one", () => {
        expect(Object.keys(digest(WITH_ATTRIBUTE))).deep.equals(["cluster#257", "cluster#257/attribute#1"]);
    });

    it("distinguishes the same element in two different clusters", () => {
        const keys = Object.keys(
            digest(WITH_ATTRIBUTE, { ...WITH_ATTRIBUTE, name: "Other", id: 0x102 } as typeof WITH_ATTRIBUTE),
        );
        expect(keys).contains("cluster#257/attribute#1");
        expect(keys).contains("cluster#258/attribute#1");
    });

    it("keys an element with no identifier by name", () => {
        const keys = Object.keys(
            digest({
                name: "Test",
                id: 0x101,
                children: [{ tag: "attribute", name: "Nameless" }],
            } as typeof WITH_ATTRIBUTE),
        );
        expect(keys).contains("cluster#257/attribute:Nameless");
    });

    it("records a structured default by its content", () => {
        // Interpolating an object yields "[object Object]", which every DeviceTypeList default is, so changing the
        // device type or revision it names would read as no change. The shipped model carries 114 of these.
        const dtl = digestOf(MatterModel.standard)["deviceType#14/serverCluster#29/attribute:DeviceTypeList"];
        expect(dtl?.default).equals("[{deviceType=14,revision=2}]");
    });

    it("reports a structured default whose content changes", () => {
        const before: ModelDigest = {
            "cluster#1/attribute#0": { tag: "attribute", name: "L", id: 0, default: "[{deviceType=14,revision=2}]" },
        };
        const after: ModelDigest = {
            "cluster#1/attribute#0": { tag: "attribute", name: "L", id: 0, default: "[{deviceType=14,revision=3}]" },
        };
        expect(findLosses(before, after).map(r => r.kind)).deep.equals(["default"]);
    });

    it("records the identifier, constraint and default", () => {
        const entry = digest(WITH_ATTRIBUTE)["cluster#257/attribute#1"];
        expect(entry.name).equals("Thing");
        expect(entry.id).equals(0x1);
        expect(entry.constraint).equals("1 to 4");
        expect(entry.default).equals("2");
    });
});

describe("loss detection", () => {
    const previous = digest(WITH_ATTRIBUTE);

    it("reports nothing when the model is unchanged", () => {
        expect(findLosses(previous, digest(WITH_ATTRIBUTE))).deep.equals([]);
    });

    it("reports an element that disappears", () => {
        const next = digest({ name: "Test", id: 0x101 });
        expect(findLosses(previous, next).map(r => [r.kind, r.key])).deep.equals([
            ["element", "cluster#257/attribute#1"],
        ]);
    });

    it("reports a constraint that disappears", () => {
        const next = digest({
            name: "Test",
            id: 0x101,
            children: [{ tag: "attribute", name: "Thing", id: 0x1, default: 2 }],
        } as typeof WITH_ATTRIBUTE);
        expect(findLosses(previous, next).map(r => r.kind)).deep.equals(["constraint"]);
    });

    it("reports a default that disappears", () => {
        const next = digest({
            name: "Test",
            id: 0x101,
            children: [{ tag: "attribute", name: "Thing", id: 0x1, constraint: "1 to 4" }],
        } as typeof WITH_ATTRIBUTE);
        expect(findLosses(previous, next).map(r => r.kind)).deep.equals(["default"]);
    });

    it("reports an identifier reservation that disappears", () => {
        const next = digest({
            name: "Test",
            id: 0x101,
            children: [{ tag: "attribute", name: "Thing", constraint: "1 to 4", default: 2 }],
        } as typeof WITH_ATTRIBUTE);
        expect(findLosses(previous, next).map(r => r.kind)).deep.equals(["element"]);
    });

    it("reports a constraint that narrows", () => {
        const next = digest({
            name: "Test",
            id: 0x101,
            children: [{ tag: "attribute", name: "Thing", id: 0x1, constraint: "1 to 2", default: 2 }],
        } as typeof WITH_ATTRIBUTE);
        expect(findLosses(previous, next).map(r => [r.kind, r.was, r.now])).deep.equals([
            ["constraint", "1 to 4", "1 to 2"],
        ]);
    });

    it("reports an access flag that goes away while the rest remains", () => {
        // Dropping F from "F A" is what the specification omitted for AnnounceOtaProvider; access still states
        // something, so a check for disappearance alone would see nothing
        const before: ModelDigest = { "cluster#1/command#0": { tag: "command", name: "Do", id: 0, access: "F A" } };
        const after: ModelDigest = { "cluster#1/command#0": { tag: "command", name: "Do", id: 0, access: "A" } };
        expect(findLosses(before, after).map(r => [r.kind, r.was, r.now])).deep.equals([["access", "F A", "A"]]);
    });

    it("reports a default that becomes explicitly null", () => {
        const before: ModelDigest = { "cluster#1/attribute#0": { tag: "attribute", name: "T", id: 0, default: "2" } };
        const after: ModelDigest = {
            "cluster#1/attribute#0": { tag: "attribute", name: "T", id: 0, default: "null" },
        };
        expect(findLosses(before, after).map(r => r.kind)).deep.equals(["default"]);
    });

    it("reports a reservation moved to a different identifier", () => {
        const next = digest({
            name: "Test",
            id: 0x101,
            children: [{ tag: "attribute", name: "Thing", id: 0x2, constraint: "1 to 4", default: 2 }],
        } as typeof WITH_ATTRIBUTE);
        expect(findLosses(previous, next).map(r => r.kind)).deep.equals(["element"]);
    });

    it("reports a condition requirement location that disappears", () => {
        function oven(location?: "Descendant") {
            return digestOf(
                new MatterModel(
                    { name: "Matter" },
                    new DeviceTypeModel(
                        { name: "Oven", id: 0x7b, classification: "simple" },
                        new RequirementModel({ name: "Heater", element: "condition", location, constraint: "min 1" }),
                    ),
                ),
            );
        }

        expect(findLosses(oven("Descendant"), oven()).map(r => [r.kind, r.key, r.was])).deep.equals([
            ["location", "deviceType#123/condition:Heater", "Descendant"],
        ]);
    });

    it("reports nothing for an addition", () => {
        const next = digest({
            ...WITH_ATTRIBUTE,
            children: [...WITH_ATTRIBUTE.children!, { tag: "attribute", name: "Extra", id: 0x2 }],
        } as typeof WITH_ATTRIBUTE);
        expect(findLosses(previous, next)).deep.equals([]);
    });

    it("does not report a rename that keeps the identifier, because the reservation survives", () => {
        const next = digest({
            name: "Test",
            id: 0x101,
            children: [{ tag: "attribute", name: "Renamed", id: 0x1, constraint: "1 to 4", default: 2 }],
        } as typeof WITH_ATTRIBUTE);
        expect(findLosses(previous, next)).deep.equals([]);
    });
});

describe("acknowledged removals", () => {
    it("names a kind, a specification revision and a reason for every entry", () => {
        for (const { key, kind, revision, reason } of AcknowledgedRemovals) {
            expect(key, "key").not.empty;
            expect(kind, `${key} kind`).not.empty;
            expect(revision, `${key} revision`).match(/^\d+\.\d+(\.\d+)?$/);
            expect(reason, `${key} reason`).not.empty;
        }
    });

    it("keys every entry the way the digest keys an element", () => {
        // A key in any other shape matches nothing, so the entry silently stops excusing the removal it names
        for (const { key } of AcknowledgedRemovals) {
            for (const segment of key.split("/")) {
                expect(segment, `${key} segment ${segment}`).match(/^[a-zA-Z]+(#\d+|:[A-Za-z0-9_]+)(@\d+)?$/);
            }
        }
    });

    it("does not list the same element twice", () => {
        const keys = AcknowledgedRemovals.map(entry => entry.key);
        expect(new Set(keys).size).equals(keys.length);
    });

    it("filters only what it names", () => {
        const previous: ModelDigest = {
            "datatype:status/field#140": {
                tag: "field",
                name: "UnreportableAttribute",
                id: 0x8c,
            },
            "datatype:status/field#156": { tag: "field", name: "Busy", id: 0x9c },
        };

        // As generate-model matches: the kind and the revision, not the key alone
        const acknowledged = new Set(
            AcknowledgedRemovals.filter(entry => entry.revision === "1.6.1").map(
                entry => `${entry.kind}\u0000${entry.key}`,
            ),
        );
        const surviving = findLosses(previous, {}).filter(
            removal => !acknowledged.has(`${removal.kind}\u0000${removal.key}`),
        );

        expect(surviving.map(r => r.key)).deep.equals(["datatype:status/field#156"]);
    });
});
