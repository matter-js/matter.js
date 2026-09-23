/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Matter } from "#index.js";
import { RequirementResolver } from "#logic/RequirementResolver.js";
import {
    AttributeModel,
    ClusterModel,
    ConditionModel,
    DeviceTypeModel,
    FieldModel,
    MatterModel,
    RequirementModel,
} from "#models/index.js";

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

        it("includes conditions a base of the device type declares", () => {
            const conditions = RequirementResolver.conditionsOf(deviceType("ElectricalMeter"));
            expect(conditions.get("activetariff")?.parent?.name).equals("ElectricalEnergyTariff");
        });

        it("prefers the device type's own condition over its base's, and its base's over a universal one", () => {
            const universal = new ConditionModel({ name: "Sit" });
            const inherited = new ConditionModel({ name: "Sit" });
            const inheritedOnly = new ConditionModel({ name: "Lit" });
            const universalLit = new ConditionModel({ name: "Lit" });
            const own = new ConditionModel({ name: "Sit" });
            const parent = new DeviceTypeModel(
                { name: "Parent", id: 0xff05, classification: "simple" },
                inherited,
                inheritedOnly,
            );
            const child = new DeviceTypeModel(
                { name: "Child", id: 0xff06, classification: "simple", type: "Parent" },
                own,
            );
            new MatterModel(
                {},
                new DeviceTypeModel({ name: "Base", classification: "base" }, universal, universalLit),
                parent,
                child,
            );

            const conditions = RequirementResolver.conditionsOf(child);
            expect(conditions.get("sit")).equals(own);
            expect(conditions.get("lit")).equals(inheritedOnly);
            expect(RequirementResolver.conditionsOf(parent).get("sit")).equals(inherited);
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

            // Power Topology's NODE feature against the universal Node condition, on a requirement nested in the
            // cluster requirement
            const nested = new RequirementModel({ name: "AvailableEndpoints", element: "attribute" });
            new MatterModel(
                {},
                new DeviceTypeModel({ name: "Base", classification: "base" }, new ConditionModel({ name: "Node" })),
                new ClusterModel(
                    { name: "Topology", id: 0xfff3 },
                    new AttributeModel(
                        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
                        new FieldModel({ name: "NODE", constraint: "0", title: "NodeTopology" }),
                    ),
                ),
                new DeviceTypeModel(
                    { name: "Sensing", id: 0xff07, classification: "simple" },
                    new RequirementModel({ name: "Topology", id: 0xfff3, element: "serverCluster" }, nested),
                ),
            );

            expect(RequirementResolver.resolve(nested, "NODE")?.tag).equals("field");
            expect(RequirementResolver.resolve(nested, "NODE")?.name).equals("NODE");
            expect(RequirementResolver.resolve(nested, "Node")?.tag).equals("condition");
        });

        it("does not resolve a cluster requirement's own conformance against the cluster's features", () => {
            const icd = requirement("RootNode", "IcdManagement");
            expect(RequirementResolver.resolve(icd, "LITS")).undefined;
            expect(RequirementResolver.resolve(requirement("ElectricalSensor", "PowerTopology"), "NODE")?.tag).equals(
                "condition",
            );
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

    describe("endpointScopeOf", () => {
        // Identity, not deep equality: two device types or clusters compare deeply equal regardless of name
        function expectScope(
            requirement: RequirementModel,
            deviceType: DeviceTypeModel | undefined,
            cluster: ClusterModel | undefined,
        ) {
            const scope = RequirementResolver.endpointScopeOf(requirement);
            expect(scope.deviceType).equals(deviceType);
            expect(scope.cluster).equals(cluster);
        }

        /**
         * An outer device type requiring a component, each declaring a condition of its own, and a cluster whose
         * feature the requirements may name.
         */
        function composite(componentId = 0xff11) {
            const model = {
                clientNested: new RequirementModel({ name: "OnTime", element: "attribute" }),
                serverNested: new RequirementModel({ name: "OnTime", element: "attribute" }),
                componentNested: new RequirementModel({ name: "OnTime", element: "attribute" }),
                unknownClusterNested: new RequirementModel({ name: "OnTime", element: "attribute" }),
            };
            const clientCluster = new RequirementModel(
                { name: "Scoped", id: 0xfff4, element: "clientCluster" },
                model.clientNested,
            );
            const serverCluster = new RequirementModel(
                { name: "Scoped", id: 0xfff4, element: "serverCluster" },
                model.serverNested,
            );
            const componentCluster = new RequirementModel(
                { name: "Scoped", id: 0xfff4, element: "serverCluster" },
                model.componentNested,
            );
            const unknownCluster = new RequirementModel(
                { name: "NoSuchCluster", id: 0xfff9, element: "serverCluster" },
                model.unknownClusterNested,
            );
            const component = new RequirementModel(
                { name: "Component", id: componentId, element: "deviceType" },
                componentCluster,
            );
            const cluster = new ClusterModel(
                { name: "Scoped", id: 0xfff4 },
                new AttributeModel(
                    { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
                    new FieldModel({ name: "LT", constraint: "0", title: "Lighting" }),
                ),
                new AttributeModel({ name: "OnTime", id: 0x4001, type: "uint16" }),
            );
            const componentType = new DeviceTypeModel(
                { name: "Component", id: 0xff11, classification: "simple" },
                new ConditionModel({ name: "ComponentCond" }),
            );
            const outer = new DeviceTypeModel(
                { name: "Outer", id: 0xff12, classification: "simple" },
                new ConditionModel({ name: "OuterCond" }),
                clientCluster,
                serverCluster,
                unknownCluster,
                component,
            );
            new MatterModel(
                {},
                new DeviceTypeModel({ name: "Base", classification: "base" }, new ConditionModel({ name: "Sit" })),
                cluster,
                componentType,
                outer,
            );

            return {
                ...model,
                clientCluster,
                serverCluster,
                componentCluster,
                unknownCluster,
                component,
                cluster,
                componentType,
                outer,
            };
        }

        it("answers the owning device type and no cluster for a cluster requirement", () => {
            const { serverCluster, outer } = composite();
            expectScope(serverCluster, outer, undefined);
        });

        it("answers the enclosing server cluster for a nested requirement", () => {
            const { serverNested, outer, cluster } = composite();
            expectScope(serverNested, outer, cluster);
        });

        it("answers the enclosing client cluster for a nested requirement", () => {
            const { clientNested, outer, cluster } = composite();
            expectScope(clientNested, outer, cluster);
        });

        it("answers the component device type for a requirement nested in a component requirement", () => {
            const { componentCluster, componentNested, componentType, cluster } = composite();
            expectScope(componentCluster, componentType, undefined);
            expectScope(componentNested, componentType, cluster);
        });

        it("answers the owning device type for a component requirement itself", () => {
            const { component, outer } = composite();
            expect(RequirementResolver.endpointScopeOf(component).deviceType).equals(outer);
        });

        it("answers no device type for a component the model does not define", () => {
            const { componentCluster } = composite(0xfffe);
            expect(RequirementResolver.endpointScopeOf(componentCluster).deviceType).undefined;
        });

        it("answers no cluster for a cluster the model does not define", () => {
            const { unknownClusterNested, outer } = composite();
            expectScope(unknownClusterNested, outer, undefined);
        });

        it("answers nothing for a requirement in no device type", () => {
            expectScope(new RequirementModel({ name: "OnOff", element: "serverCluster" }), undefined, undefined);
        });

        it("answers the component device type of real data", () => {
            const sensor = deviceType("BatteryStorage").requirements.find(child => child.name === "ElectricalSensor");
            const measurement = sensor?.requirements.find(child => child.name === "ElectricalPowerMeasurement");
            expect(measurement).instanceof(RequirementModel);
            expect(RequirementResolver.endpointScopeOf(measurement!).deviceType).equals(deviceType("ElectricalSensor"));
        });

        describe("resolve", () => {
            it("resolves a feature of the enclosing client cluster", () => {
                const { clientNested, cluster } = composite();
                expect(RequirementResolver.resolve(clientNested, "LT")).equals(cluster.features[0]);
            });

            it("resolves the component's conditions below a component requirement, not the outer device type's", () => {
                const { componentCluster, componentType } = composite();
                expect(RequirementResolver.resolve(componentCluster, "ComponentCond")?.parent).equals(componentType);
                expect(RequirementResolver.resolve(componentCluster, "OuterCond")).undefined;
                expect(RequirementResolver.resolve(componentCluster, "Sit")?.name).equals("Sit");
            });

            it("resolves the outer device type's conditions on a component requirement itself", () => {
                const { component, outer } = composite();
                expect(RequirementResolver.resolve(component, "OuterCond")?.parent).equals(outer);
                expect(RequirementResolver.resolve(component, "ComponentCond")).undefined;
            });

            it("resolves only universal and qualified names below a component the model does not define", () => {
                const { componentCluster } = composite(0xfffe);
                expect(RequirementResolver.resolve(componentCluster, "Sit")?.name).equals("Sit");
                expect(RequirementResolver.resolve(componentCluster, "OuterCond")).undefined;
                expect(RequirementResolver.resolve(componentCluster, ["Outer", "OuterCond"])?.name).equals("OuterCond");
            });

            it("resolves a condition a base of the device type declares", () => {
                const meter = deviceType("ElectricalMeter").requirements[0];
                expect(RequirementResolver.resolve(meter, "ActiveTariff")?.parent?.name).equals(
                    "ElectricalEnergyTariff",
                );
            });
        });

        describe("clusterOf", () => {
            it("answers the cluster a cluster requirement names", () => {
                const { serverCluster, cluster } = composite();
                expect(RequirementResolver.clusterOf(serverCluster)).equals(cluster);
            });

            it("answers the cluster enclosing a nested requirement", () => {
                const { clientNested, cluster } = composite();
                expect(RequirementResolver.clusterOf(clientNested)).equals(cluster);
            });

            it("answers nothing for a cluster the model does not define", () => {
                const { unknownCluster, unknownClusterNested } = composite();
                expect(RequirementResolver.clusterOf(unknownClusterNested)).undefined;
                expect(RequirementResolver.clusterOf(unknownCluster)).undefined;
            });

            it("answers nothing for a requirement outside a cluster requirement", () => {
                const { component } = composite();
                expect(RequirementResolver.clusterOf(component)).undefined;
            });
        });
    });

    describe("featureOf", () => {
        /** A feature requirement inside a cluster whose single feature has a code and a title that differ */
        function featureRequirement(name: string, element: "feature" | "attribute" = "feature") {
            const requirement = new RequirementModel({ name, element });
            new MatterModel(
                {},
                new ClusterModel(
                    { name: "Featured", id: 0xfff1 },
                    new AttributeModel(
                        { name: "FeatureMap", id: 0xfffc, type: "FeatureMap" },
                        new FieldModel({ name: "LITS", constraint: "2", title: "LongIdleTimeSupport" }),
                    ),
                ),
                new DeviceTypeModel(
                    { name: "Featuring", id: 0xff04, classification: "simple" },
                    new RequirementModel({ name: "Featured", id: 0xfff1, element: "serverCluster" }, requirement),
                ),
            );
            return requirement;
        }

        it("answers the feature a requirement names by the feature's title", () => {
            const icd = requirement("RootNode", "IcdManagement");
            const longIdle = icd.requirements.find(child => child.name === "LONGIDLETIMESUPPORT")!;
            const feature = RequirementResolver.featureOf(longIdle);
            expect(feature?.name).equals("LITS");
            expect(feature).equals(Matter.clusters("IcdManagement")?.features.find(feature => feature.name === "LITS"));
        });

        it("answers the feature a requirement names by the feature's code", () => {
            expect(RequirementResolver.featureOf(featureRequirement("lits"))?.name).equals("LITS");
        });

        it("answers the feature named by its title in another case or spacing", () => {
            expect(RequirementResolver.featureOf(featureRequirement("Long Idle Time Support"))?.name).equals("LITS");
        });

        it("answers nothing for a requirement naming no feature of the cluster", () => {
            expect(RequirementResolver.featureOf(featureRequirement("NOSUCHFEATURE"))).undefined;
        });

        it("answers nothing for a requirement that is not a feature requirement", () => {
            expect(RequirementResolver.featureOf(featureRequirement("LITS", "attribute"))).undefined;
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

        it("answers nothing for a requirement that is not a condition requirement", () => {
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
