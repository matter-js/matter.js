/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "#index.js";
import { RequirementResolver } from "#logic/RequirementResolver.js";
import { ConditionModel, DeviceTypeModel, MatterModel, RequirementModel } from "#models/index.js";

function deviceType(name: string) {
    const model = Matter.deviceTypes(name);
    expect(model).instanceof(DeviceTypeModel);
    return model!;
}

function requirement(deviceTypeName: string, requirementName: string) {
    const model = deviceType(deviceTypeName).requirements.find(child => child.name === requirementName);
    expect(model).instanceof(RequirementModel);
    return model!;
}

describe("RequirementResolver", () => {
    describe("conditionsOf", () => {
        it("includes conditions Base declares", () => {
            const conditions = RequirementResolver.conditionsOf(deviceType("RootNode"));
            expect(conditions.has("sit")).true;
            expect(conditions.has("duplicate")).true;
        });

        it("includes conditions the device type declares itself", () => {
            const conditions = RequirementResolver.conditionsOf(deviceType("RootNode"));
            expect(conditions.has("powersourcecond")).true;
        });

        it("keys a qualified name", () => {
            const conditions = RequirementResolver.conditionsOf(deviceType("Refrigerator"));
            expect(conditions.has("temperaturecontrolledcabinet.cooler")).true;
        });

        it("keys a universal condition by its qualified name too", () => {
            const conditions = RequirementResolver.conditionsOf(deviceType("Refrigerator"));
            expect(conditions.get("base.ip")).equals(conditions.get("ip"));
        });

        it("prefers a condition the device type declares over a universal one of the same name", () => {
            const universal = new ConditionModel({ name: "Sit" });
            const own = new ConditionModel({ name: "Sit" });
            const local = new DeviceTypeModel({ name: "Local", id: 0xff01, classification: "simple" }, own);
            new MatterModel({}, new DeviceTypeModel({ name: "Base", classification: "base" }, universal), local);

            const conditions = RequirementResolver.conditionsOf(local);
            expect(conditions.get("sit")).equals(own);
            expect(conditions.get("base.sit")).equals(universal);
            expect(conditions.get("local.sit")).equals(own);
        });

        it("does not key a foreign condition unqualified", () => {
            const conditions = RequirementResolver.conditionsOf(deviceType("Refrigerator"));
            expect(conditions.has("cooler")).false;
            expect(conditions.has("powersourcecond")).false;
        });
    });

    describe("resolve", () => {
        it("prefers a cluster feature over a condition of the same name", () => {
            // The collision this guards against: the cluster's feature and the universal condition differ only in case
            const feature = Matter.clusters("PowerTopology")?.features.find(feature => feature.name === "NODE");
            expect(feature).ok;
            expect(RequirementResolver.conditionsOf(deviceType("ElectricalSensor")).get("node")?.name).equals("Node");

            const resolved = RequirementResolver.resolve(requirement("ElectricalSensor", "PowerTopology"), "NODE");
            expect(resolved).equals(feature);
        });

        it("resolves a condition named by a cluster requirement", () => {
            expect(RequirementResolver.resolve(requirement("RootNode", "IcdManagement"), "Sit")?.tag).equals(
                "condition",
            );
        });

        it("resolves a condition the conformance spells in another case", () => {
            const icd = requirement("RootNode", "IcdManagement");
            expect(RequirementResolver.resolve(icd, "SIT")?.name).equals("Sit");
            expect(RequirementResolver.resolve(icd, ["Base", "SIT"])?.name).equals("Sit");
        });

        it("resolves a feature named by a nested requirement", () => {
            const icd = requirement("RootNode", "IcdManagement");
            const longIdle = icd.requirements.find(child => child.name === "LONGIDLETIMESUPPORT")!;
            expect(RequirementResolver.resolve(longIdle, "LITS")).equals(
                Matter.clusters("IcdManagement")?.features.find(feature => feature.name === "LITS"),
            );
        });

        it("resolves nothing for an unknown name", () => {
            expect(RequirementResolver.resolve(requirement("RootNode", "IcdManagement"), "NoSuchThing")).undefined;
        });

        it("resolves a name that is a feature of another cluster as a condition", () => {
            // Keying conditions case-insensitively is what lets conformance spell a condition as the specification's
            // tables do, and it means a name shaped like a feature still lands on a condition of that name
            expect(RequirementResolver.resolve(requirement("RootNode", "IcdManagement"), "NODE")?.name).equals("Node");
        });
    });

    describe("conditionNameOf", () => {
        it("answers the canonical name a qualified condition requirement asserts", () => {
            expect(RequirementResolver.conditionNameOf(requirement("Refrigerator", "Cooler"))).equals("Cooler");
        });

        it("answers the name the condition declares, not the case the requirement states", () => {
            const asserting = new DeviceTypeModel(
                { name: "Asserting", id: 0xff02, classification: "simple" },
                new RequirementModel({ name: "SIT", element: "condition", type: "Declaring.Sit" }),
            );
            new MatterModel(
                {},
                new DeviceTypeModel(
                    { name: "Declaring", id: 0xff03, classification: "simple" },
                    new ConditionModel({ name: "Sit" }),
                ),
                asserting,
            );

            expect(RequirementResolver.conditionNameOf(asserting.requirements[0])).equals("Sit");
        });

        it("answers nothing for a requirement that is no condition", () => {
            expect(RequirementResolver.conditionNameOf(requirement("RootNode", "IcdManagement"))).undefined;
        });

        it("falls back to the name of a condition requirement that resolves to nothing", () => {
            const unresolvable = new RequirementModel({
                name: "NoSuchCondition",
                element: "condition",
                type: "NoSuchDeviceType.NoSuchCondition",
            });
            expect(RequirementResolver.conditionNameOf(unresolvable)).equals("NoSuchCondition");
        });
    });
});
