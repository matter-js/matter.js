/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DescriptorServer } from "#behaviors/descriptor";
import { OnOffLightDevice } from "#devices/on-off-light";
import { OnOffLightSwitchDevice } from "#devices/on-off-light-switch";
import { Endpoint } from "#endpoint/Endpoint.js";
import { ConditionAssertions, NodeCondition, StructuralCondition } from "#endpoint/validation/ConditionAssertions.js";
import { EndpointFacts } from "#endpoint/validation/EndpointFacts.js";
import { ValidationPass } from "#endpoint/validation/ValidationPass.js";
import { SecondaryNetworkInterfaceEndpoint } from "#endpoints/secondary-network-interface";
import { ImplementationError } from "@matter/general";
import { ConditionModel, DeviceTypeModel, Matter, MatterModel, RequirementModel } from "@matter/model";
import { MockServerNode } from "../../node/mock-server-node.js";
import {
    addCabinet,
    addRefrigerator,
    createBleNode,
    createNode,
    deviceTypeList,
    RootWithEthernet,
    RootWithThread,
    RootWithWiFi,
    ThreadCommissioningServer,
} from "./validation-helpers.js";

const DescribedLight = OnOffLightDevice.with(DescriptorServer);
const DescribedSwitch = OnOffLightSwitchDevice.with(DescriptorServer);

const SELF_ASSERTER_ID = 0xfff10001;
const DYNAMIC_ID = 0xfff10002;
const APPLICATION_ID = 0xfff10003;
const HOLDER_ID = 0xfff10004;
const SELF_HOLDER_ID = 0xfff10005;

/** Device types the standard model lacks: a Self assertion and the classifications no standard device type uses */
function fixtureModel() {
    const model = new MatterModel(
        {},
        new DeviceTypeModel({ name: "Base", classification: "base" }),
        new DeviceTypeModel(
            { name: "SelfAsserter", id: SELF_ASSERTER_ID, classification: "simple" },
            new ConditionModel({ name: "Selfish" }),
            new RequirementModel({ name: "Selfish", element: "condition", conformance: "M", location: "Self" }),
        ),
        new DeviceTypeModel(
            { name: "Holder", id: HOLDER_ID, classification: "simple" },
            new ConditionModel({ name: "Held" }),
        ),
        new DeviceTypeModel(
            { name: "SelfHolder", id: SELF_HOLDER_ID, classification: "simple" },
            new RequirementModel({
                name: "Held",
                type: "Holder.Held",
                element: "condition",
                conformance: "M",
                location: "Self",
            }),
        ),
        new DeviceTypeModel({ name: "Dynamo", id: DYNAMIC_ID, classification: "dynamic" }),
        new DeviceTypeModel({ name: "Applied", id: APPLICATION_ID, classification: "application" }),
    );
    model.finalize();
    return model;
}

/**
 * An endpoint that lists the Camera device type. Collection reads only the Descriptor, and a real camera needs
 * implementations of its streaming clusters to start.
 */
async function addCamera(parent: Endpoint) {
    return parent.add(DescribedLight, { id: "camera", descriptor: { deviceTypeList: deviceTypeList("Camera") } });
}

function memberOf(cluster: string, name: string) {
    const member = Matter.clusters(cluster)?.children.find(child => child.name === name);
    if (member === undefined) {
        throw new ImplementationError(`Test fixture names unknown member ${cluster}.${name}`);
    }
    return member;
}

describe("ConditionAssertions", () => {
    describe("collect", () => {
        it("asserts a Root condition on the node endpoint", async () => {
            const node = await createNode();
            const camera = await addCamera(node);

            const collection = ConditionAssertions.collect(node);

            expect(collection.conditionsOf(node).has("PowerSourceCond")).true;
            expect(collection.conditionsOf(camera).has("PowerSourceCond")).false;
            expect(collection.descendantAssertionsOf(camera)).deep.equals([]);

            await node.close();
        });

        it("does not assert an optional condition requirement", async () => {
            const node = await createNode();
            await node.add(DescribedLight, { id: "lock", descriptor: { deviceTypeList: deviceTypeList("DoorLock") } });

            // DoorLock states AclExtensionCond "M" and TimeSyncCond "O"
            const conditions = ConditionAssertions.collect(node).conditionsOf(node);
            expect(conditions.has("AclExtensionCond")).true;
            expect(conditions.has("TimeSyncCond")).false;

            await node.close();
        });

        it("asserts a Self condition on the asserting endpoint", async () => {
            const node = await createNode();
            const endpoint = await node.add(DescribedLight, {
                id: "asserter",
                descriptor: { deviceTypeList: deviceTypeList(SELF_ASSERTER_ID) },
            });

            const collection = ConditionAssertions.collect(node, new ValidationPass(fixtureModel()));

            expect(collection.conditionsOf(endpoint).has("Selfish")).true;
            expect(collection.conditionsOf(node).has("Selfish")).false;
            expect(collection.descendantAssertionsOf(endpoint)).deep.equals([]);

            await node.close();
        });

        it("asserts a Self condition on no child that lists its declaring device type", async () => {
            const node = await createNode();
            const holder = await node.add(DescribedLight, {
                id: "holder",
                descriptor: { deviceTypeList: deviceTypeList(SELF_HOLDER_ID) },
            });
            const child = await holder.add(DescribedLight, {
                id: "child",
                descriptor: { deviceTypeList: deviceTypeList(HOLDER_ID) },
            });

            const collection = ConditionAssertions.collect(node, new ValidationPass(fixtureModel()));

            expect(collection.conditionsOf(holder).has("Held")).true;
            expect(collection.conditionsOf(child).has("Held")).false;

            await node.close();
        });

        it("asserts a Descendant condition on every matching child", async () => {
            const node = await createNode();
            const {
                fridge,
                cabinets: [first, second],
            } = await addRefrigerator(node);

            const collection = ConditionAssertions.collect(node);

            expect(collection.conditionsOf(first).has("Cooler")).true;
            expect(collection.conditionsOf(second).has("Cooler")).true;
            expect(collection.conditionsOf(fridge).has("Cooler")).false;

            const descendantAssertions = collection.descendantAssertionsOf(fridge);
            expect(descendantAssertions).length(1);
            const [assertion] = descendantAssertions;
            expect(assertion.endpoint).equals(fridge);
            expect(assertion.requirement.name).equals("Cooler");
            expect(assertion.matches).deep.equals([first, second]);

            await node.close();
        });

        it("reports a Descendant assertion that reaches no endpoint", async () => {
            const node = await createNode();
            const { fridge } = await addRefrigerator(node, { cabinets: 0 });

            const descendantAssertions = ConditionAssertions.collect(node).descendantAssertionsOf(fridge);

            expect(descendantAssertions.map(({ endpoint, matches }) => ({ endpoint, matches }))).deep.equals([
                { endpoint: fridge, matches: [] },
            ]);

            await node.close();
        });

        it("limits a tree-pattern Descendant assertion to children", async () => {
            const node = await createNode();
            const { fridge } = await addRefrigerator(node, { cabinets: 0 });
            const shelf = await fridge.add(OnOffLightDevice, { id: "shelf" });
            const grandchild = await addCabinet(shelf, "grandchild");

            const collection = ConditionAssertions.collect(node);
            expect(collection.conditionsOf(grandchild).has("Cooler")).false;
            expect(collection.conditionsOf(shelf).has("Cooler")).false;

            await node.close();
        });

        it("extends a full-family Descendant assertion to descendants but not into a nested node", async () => {
            const node = await createNode();
            const {
                fridge,
                cabinets: [child],
            } = await addRefrigerator(node, { cabinets: 1, fullFamily: true });
            const shelf = await fridge.add(OnOffLightDevice, { id: "shelf" });
            const grandchild = await addCabinet(shelf, "grandchild");
            const nested = await fridge.add(DescribedLight, {
                id: "nested",
                descriptor: { deviceTypeList: deviceTypeList("RootNode") },
            });
            const beyond = await addCabinet(nested, "beyond");
            const { fridge: nestedFridge } = await addRefrigerator(nested, { cabinets: 0 });

            const collection = ConditionAssertions.collect(node);

            expect(collection.conditionsOf(child).has("Cooler")).true;
            expect(collection.conditionsOf(grandchild).has("Cooler")).true;
            expect(collection.descendantAssertionsOf(fridge)[0].matches).deep.equals([child, grandchild]);
            expect(collection.conditionsOf(beyond).size).equals(0);
            expect(collection.descendantAssertionsOf(nestedFridge)).deep.equals([]);

            await node.close();
        });

        it("covers exactly one node scope", async () => {
            const node = await createNode();
            const nested = await node.add(DescribedLight, {
                id: "nested",
                descriptor: { deviceTypeList: deviceTypeList("RootNode") },
            });
            const camera = await addCamera(nested);

            const outer = ConditionAssertions.collect(node);
            expect(outer.conditionsOf(nested).size).equals(0);
            expect(outer.conditionsOf(camera).size).equals(0);
            expect(outer.conditionsOf(node).has("PowerSourceCond")).false;

            const inner = ConditionAssertions.collect(nested);
            expect(inner.conditionsOf(nested).has("PowerSourceCond")).true;

            await node.close();
        });

        it("includes a condition the endpoint states", async () => {
            const node = await createNode();
            const light = await node.add(DescribedLight, {
                id: "light",
                deviceConditions: ["BridgedPowerSourceInfo", "RootNode.PowerSourceCond", "sit"],
            });

            const conditions = ConditionAssertions.collect(node).conditionsOf(light);

            expect(conditions.has("BridgedPowerSourceInfo")).true;
            expect(conditions.has("PowerSourceCond")).true;
            expect(conditions.has("RootNode.PowerSourceCond")).false;
            expect(conditions.has("sit")).false;
            expect(conditions.has("Sit")).false;

            await node.close();
        });
    });

    describe("structural conditions", () => {
        it("spells every structural condition as Base declares it", () => {
            const base = Matter.deviceTypes("Base");
            const declared = new Set(base?.all(ConditionModel).map(condition => condition.name));

            for (const name of Object.values<string>(StructuralCondition)) {
                expect(declared.has(name), `Base declares ${name}`).true;
            }
        });

        it("derives Node from a node device type", async () => {
            const node = await createNode();
            const light = await node.add(OnOffLightDevice, { id: "light" });

            const collection = ConditionAssertions.collect(node);

            expect(collection.conditionsOf(node).has("Node")).true;
            expect(collection.conditionsOf(light).has("Node")).false;

            await node.close();
        });

        it("derives App and Simple from a simple device type", async () => {
            const node = await createNode();
            const light = await node.add(OnOffLightDevice, { id: "light" });

            const collection = ConditionAssertions.collect(node);

            expect(collection.conditionsOf(light).has("App")).true;
            expect(collection.conditionsOf(light).has("Simple")).true;
            expect(collection.conditionsOf(light).has("Dynamic")).false;
            expect(collection.conditionsOf(node).has("App")).false;
            expect(collection.conditionsOf(node).has("Simple")).false;

            await node.close();
        });

        it("derives App and Dynamic from a dynamic device type", async () => {
            const node = await createNode();
            const endpoint = await node.add(DescribedLight, {
                id: "dynamo",
                descriptor: { deviceTypeList: deviceTypeList(DYNAMIC_ID) },
            });

            const conditions = ConditionAssertions.collect(node, new ValidationPass(fixtureModel())).conditionsOf(
                endpoint,
            );

            expect(conditions.has("App")).true;
            expect(conditions.has("Dynamic")).true;
            expect(conditions.has("Simple")).false;

            await node.close();
        });

        it("derives App from an application device type", async () => {
            const node = await createNode();
            const endpoint = await node.add(DescribedLight, {
                id: "applied",
                descriptor: { deviceTypeList: deviceTypeList(APPLICATION_ID) },
            });

            const conditions = ConditionAssertions.collect(node, new ValidationPass(fixtureModel())).conditionsOf(
                endpoint,
            );

            expect(conditions.has("App")).true;
            expect(conditions.has("Simple")).false;
            expect(conditions.has("Dynamic")).false;

            await node.close();
        });

        it("derives Composed from component device type requirements", async () => {
            const node = await createNode();
            const {
                fridge,
                cabinets: [cabinet],
            } = await addRefrigerator(node, { cabinets: 1 });

            const collection = ConditionAssertions.collect(node);

            expect(collection.conditionsOf(fridge).has("Composed")).true;
            expect(collection.conditionsOf(cabinet).has("Composed")).false;

            await node.close();
        });

        it("derives Server from an application server cluster", async () => {
            const node = await createNode();
            const light = await node.add(OnOffLightDevice, { id: "light" });
            const lightSwitch = await node.add(OnOffLightSwitchDevice, { id: "switch" });

            const collection = ConditionAssertions.collect(node);

            expect(collection.conditionsOf(light).has("Server")).true;

            // The switch serves only Identify and Descriptor, which are utility clusters
            expect(collection.conditionsOf(lightSwitch).has("Server")).false;

            await node.close();
        });

        it("derives Client from an application client cluster", async () => {
            const node = await createNode();
            const light = await node.add(OnOffLightDevice, { id: "light" });
            const lightSwitch = await node.add(OnOffLightSwitchDevice, { id: "switch" });

            const collection = ConditionAssertions.collect(node);

            expect(collection.conditionsOf(lightSwitch).has("Client")).true;
            expect(collection.conditionsOf(light).has("Client")).false;

            await node.close();
        });

        it("derives Duplicate from siblings sharing an application device type", async () => {
            const node = await createNode();
            const first = await node.add(OnOffLightDevice, { id: "first" });
            const second = await node.add(OnOffLightDevice, { id: "second" });
            const lightSwitch = await node.add(OnOffLightSwitchDevice, { id: "switch" });

            const collection = ConditionAssertions.collect(node);

            expect(collection.conditionsOf(first).has("Duplicate")).true;
            expect(collection.conditionsOf(second).has("Duplicate")).true;
            expect(collection.conditionsOf(lightSwitch).has("Duplicate")).false;
            expect(collection.conditionsOf(node).has("Duplicate")).false;

            await node.close();
        });

        it("does not derive Duplicate from shared utility device types", async () => {
            const node = await createNode();
            const first = await node.add(DescribedLight, {
                id: "first",
                descriptor: { deviceTypeList: deviceTypeList("OnOffLight", "PowerSource") },
            });
            await node.add(DescribedSwitch, {
                id: "switch",
                descriptor: { deviceTypeList: deviceTypeList("OnOffLightSwitch", "PowerSource") },
            });

            expect(ConditionAssertions.collect(node).conditionsOf(first).has("Duplicate")).false;

            await node.close();
        });
    });

    describe("node conditions", () => {
        it("holds CustomNetworkConfig for every endpoint of a node that does not commission over BLE", async () => {
            const node = await createNode();
            const light = await node.add(DescribedLight, { id: "light" });

            const collection = ConditionAssertions.collect(node);

            expect(collection.conditionsOf(node).has(NodeCondition.CustomNetworkConfig)).true;
            expect(collection.conditionsOf(light).has(NodeCondition.CustomNetworkConfig)).true;

            await node.close();
        });

        it("does not hold CustomNetworkConfig for a node that commissions over BLE", async () => {
            const node = await createBleNode();

            const collection = ConditionAssertions.collect(node);

            expect(collection.conditionsOf(node).has(NodeCondition.CustomNetworkConfig)).false;

            await node.close();
        });

        for (const [root, condition] of [
            [RootWithWiFi, NodeCondition.WiFi],
            [RootWithThread, NodeCondition.Thread],
            [RootWithEthernet, NodeCondition.Ethernet],
        ] as const) {
            it(`holds ${condition} for every endpoint when NetworkCommissioning supports that interface`, async () => {
                const node = await MockServerNode.createOnline(root, {
                    device: undefined,
                });
                const light = await node.add(DescribedLight, { id: "light" });

                const collection = ConditionAssertions.collect(node);

                const interfaces = [NodeCondition.WiFi, NodeCondition.Thread, NodeCondition.Ethernet];
                expect(interfaces.filter(name => collection.conditionsOf(node).has(name))).deep.equals([condition]);
                expect(interfaces.filter(name => collection.conditionsOf(light).has(name))).deep.equals([condition]);

                await node.close();
            });
        }

        it("holds a network interface condition that a secondary interface's NetworkCommissioning supports", async () => {
            const node = await createNode();
            await node.add(SecondaryNetworkInterfaceEndpoint.with(ThreadCommissioningServer), { id: "thread" });

            const conditions = ConditionAssertions.collect(node).conditionsOf(node);

            expect(conditions.has(NodeCondition.Thread)).true;

            await node.close();
        });

        it("holds no network interface condition without NetworkCommissioning", async () => {
            const node = await createNode();

            const conditions = ConditionAssertions.collect(node).conditionsOf(node);

            expect(conditions.has(NodeCondition.WiFi)).false;
            expect(conditions.has(NodeCondition.Thread)).false;
            expect(conditions.has(NodeCondition.Ethernet)).false;

            await node.close();
        });

        it("holds a stated condition the node does not answer", async () => {
            const node = await createBleNode({ deviceConditions: ["CustomNetworkConfig", "Sit"] });

            const conditions = ConditionAssertions.collect(node).conditionsOf(node);

            expect(conditions.has(NodeCondition.CustomNetworkConfig)).true;
            expect(conditions.has("Sit")).true;

            await node.close();
        });
    });

    describe("unknownNames", () => {
        it("accepts a name in the endpoint's scope", async () => {
            const node = await createNode();
            const light = await node.add(DescribedLight, {
                id: "light",
                deviceConditions: ["BridgedPowerSourceInfo", "RootNode.PowerSourceCond"],
            });

            expect(ConditionAssertions.unknownNames(light)).deep.equals([]);

            await node.close();
        });

        it("suggests the declared spelling of a name that matches only regardless of case", async () => {
            const node = await createNode();
            const light = await node.add(DescribedLight, {
                id: "light",
                deviceConditions: ["sit", "rootnode.powersourcecond"],
            });

            expect(ConditionAssertions.unknownNames(light)).deep.equals([
                { name: "sit", suggestion: "Sit" },
                { name: "rootnode.powersourcecond", suggestion: "RootNode.PowerSourceCond" },
            ]);

            await node.close();
        });

        it("reports a name that resolves to nothing", async () => {
            const node = await createNode();
            const light = await node.add(DescribedLight, {
                id: "light",
                deviceConditions: ["Nonsense", "PhysicalInputs"],
            });

            // PhysicalInputs is declared by video players, which are outside the light's scope
            expect(ConditionAssertions.unknownNames(light)).deep.equals([
                { name: "Nonsense" },
                { name: "PhysicalInputs" },
            ]);

            await node.close();
        });

        it("accepts a name two device types of the endpoint both declare", async () => {
            // Conditions hold by name, so a name both device types declare is true for both and not ambiguous
            const node = await createNode();
            const player = await node.add(DescribedLight, {
                id: "player",
                descriptor: { deviceTypeList: deviceTypeList("BasicVideoPlayer", "CastingVideoPlayer") },
                deviceConditions: ["PhysicalInputs"],
            });

            expect(ConditionAssertions.unknownNames(player)).deep.equals([]);
            expect(ConditionAssertions.collect(node).conditionsOf(player).has("PhysicalInputs")).true;

            await node.close();
        });
    });
});

describe("EndpointFacts", () => {
    it("reads device types from the Descriptor and drops those the model does not define", async () => {
        const node = await createNode();
        const light = await node.add(DescribedLight, {
            id: "light",
            descriptor: { deviceTypeList: deviceTypeList("OnOffLight", 0xfff10099) },
        });

        expect(EndpointFacts.of(light).deviceTypes.map(deviceType => deviceType.name)).deep.equals(["OnOffLight"]);

        await node.close();
    });

    it("names server and client clusters by their model name", async () => {
        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const lightSwitch = await node.add(OnOffLightSwitchDevice, { id: "switch" });

        expect(EndpointFacts.of(light).servers.has("OnOff")).true;
        expect(EndpointFacts.of(light).clients.has("OnOff")).false;
        expect(EndpointFacts.of(lightSwitch).clients.has("OnOff")).true;

        await node.close();
    });

    it("reports features by code", async () => {
        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });

        expect([...EndpointFacts.of(light).features("OnOff")]).deep.equals(["LT"]);
        expect(EndpointFacts.of(light).features("LevelControl").size).equals(0);

        await node.close();
    });

    it("reports the attributes, commands and events a server implements", async () => {
        const node = await createNode();
        const light = await node.add(OnOffLightDevice, { id: "light" });
        const facts = EndpointFacts.of(light);

        expect(facts.supports("OnOff", memberOf("OnOff", "OnTime"))).true;
        expect(facts.supports("OnOff", memberOf("OnOff", "OnWithTimedOff"))).true;
        expect(facts.supports("OnOff", memberOf("OnOff", "OffWaitTime"))).true;
        expect(EndpointFacts.of(node).supports("BasicInformation", memberOf("BasicInformation", "StartUp"))).true;
        expect(facts.supports("LevelControl", memberOf("LevelControl", "CurrentLevel"))).false;

        await node.close();
    });

    it("lists children", async () => {
        const node = await createNode();
        const { fridge, cabinets } = await addRefrigerator(node);

        expect(EndpointFacts.of(fridge).children).deep.equals(cabinets);

        await node.close();
    });
});
