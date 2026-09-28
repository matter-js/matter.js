/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    ConditionModel,
    DeviceTypeModel,
    DeviceTypeValidationPass,
    Matter,
    MatterModel,
    NodeCondition,
    RequirementModel,
} from "#index.js";
import { ConditionAssertions } from "#logic/device-types/ConditionAssertions.js";
import { ResolvedEndpoint } from "#logic/device-types/ResolvedEndpoint.js";
import { ImplementationError } from "@matter/general";
import { endpoint, FakeEndpoint, FakeFacts, standardCluster, standardDeviceType } from "./fake-facts.js";

const ROOT_NODE = standardDeviceType("RootNode");
const ON_OFF_LIGHT = standardDeviceType("OnOffLight");
const ON_OFF_LIGHT_SWITCH = standardDeviceType("OnOffLightSwitch");
const REFRIGERATOR = standardDeviceType("Refrigerator");
const CABINET = standardDeviceType("TemperatureControlledCabinet");
const AGGREGATOR = standardDeviceType("Aggregator");

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

function pass(facts = new FakeFacts(), model: MatterModel = Matter) {
    return new DeviceTypeValidationPass(facts, model);
}

function collect(nodeEndpoint: FakeEndpoint, model?: MatterModel, facts?: FakeFacts) {
    return ConditionAssertions.collect(nodeEndpoint, pass(facts, model));
}

function rootNode() {
    return endpoint("root", ROOT_NODE);
}

function light(parent: FakeEndpoint, name = "light") {
    return endpoint(name, ON_OFF_LIGHT, { parent, servers: [standardCluster("OnOff")] });
}

function lightSwitch(parent: FakeEndpoint) {
    return endpoint("switch", ON_OFF_LIGHT_SWITCH, {
        parent,
        servers: [standardCluster("Identify")],
        clients: [standardCluster("OnOff")],
    });
}

function refrigerator(
    parent: FakeEndpoint,
    { cabinets = 2, fullFamily = false }: { cabinets?: number; fullFamily?: boolean } = {},
) {
    const fridge = endpoint("fridge", fullFamily ? [REFRIGERATOR, AGGREGATOR] : REFRIGERATOR, { parent });
    const added = new Array<FakeEndpoint>();
    for (let i = 0; i < cabinets; i++) {
        added.push(endpoint(`cabinet${i}`, CABINET, { parent: fridge }));
    }
    return { fridge, cabinets: added };
}

function networkRoot(feature: "WI" | "TH" | "ET") {
    return endpoint("root", ROOT_NODE, { servers: [standardCluster("NetworkCommissioning", { [feature]: true })] });
}

function memberOf(cluster: string, name: string) {
    const member = Matter.clusters(cluster)?.children.find(child => child.name === name);
    if (member === undefined) {
        throw new ImplementationError(`Test fixture names unknown member ${cluster}.${name}`);
    }
    return member;
}

/**
 * Records every endpoint whose {@link ResolvedEndpoint} a pass asks for until disposed.
 */
function recordingReads() {
    const { of } = ResolvedEndpoint;
    const read = new Set<unknown>();

    ResolvedEndpoint.of = <E>(endpoint: E, pass: DeviceTypeValidationPass<E>) => {
        read.add(endpoint);
        return of(endpoint, pass);
    };

    return {
        read,

        [Symbol.dispose]() {
            ResolvedEndpoint.of = of;
        },
    };
}

describe("ConditionAssertions", () => {
    describe("collect", () => {
        it("asserts a Root condition on the node endpoint", () => {
            const root = rootNode();
            const camera = endpoint("camera", standardDeviceType("Camera"), { parent: root });

            const collection = collect(root);

            expect(collection.conditionsOf(root).has("PowerSourceCond")).true;
            expect(collection.conditionsOf(camera).has("PowerSourceCond")).false;
            expect(collection.descendantAssertionsOf(camera)).deep.equals([]);
        });

        it("does not assert an optional condition requirement", () => {
            const root = rootNode();
            endpoint("lock", standardDeviceType("DoorLock"), { parent: root });

            // DoorLock states AclExtensionCond "M" and TimeSyncCond "O"
            const conditions = collect(root).conditionsOf(root);
            expect(conditions.has("AclExtensionCond")).true;
            expect(conditions.has("TimeSyncCond")).false;
        });

        it("asserts a Self condition on the asserting endpoint", () => {
            const root = rootNode();
            const asserter = endpoint("asserter", SELF_ASSERTER_ID, { parent: root });

            const collection = collect(root, fixtureModel());

            expect(collection.conditionsOf(asserter).has("Selfish")).true;
            expect(collection.conditionsOf(root).has("Selfish")).false;
            expect(collection.descendantAssertionsOf(asserter)).deep.equals([]);
        });

        it("asserts a Self condition on no child that lists its declaring device type", () => {
            const root = rootNode();
            const holder = endpoint("holder", SELF_HOLDER_ID, { parent: root });
            const child = endpoint("child", HOLDER_ID, { parent: holder });

            const collection = collect(root, fixtureModel());

            expect(collection.conditionsOf(holder).has("Held")).true;
            expect(collection.conditionsOf(child).has("Held")).false;
        });

        it("asserts a Descendant condition on every matching child", () => {
            const root = rootNode();
            const {
                fridge,
                cabinets: [first, second],
            } = refrigerator(root);

            const collection = collect(root);

            expect(collection.conditionsOf(first).has("Cooler")).true;
            expect(collection.conditionsOf(second).has("Cooler")).true;
            expect(collection.conditionsOf(fridge).has("Cooler")).false;

            const descendantAssertions = collection.descendantAssertionsOf(fridge);
            expect(descendantAssertions).length(1);
            const [assertion] = descendantAssertions;
            expect(assertion.endpoint).equals(fridge);
            expect(assertion.requirement.name).equals("Cooler");
            expect(assertion.matches).deep.equals([first, second]);
        });

        it("reports a Descendant assertion that reaches no endpoint", () => {
            const root = rootNode();
            const { fridge } = refrigerator(root, { cabinets: 0 });

            const descendantAssertions = collect(root).descendantAssertionsOf(fridge);

            expect(descendantAssertions.map(({ endpoint, matches }) => ({ endpoint, matches }))).deep.equals([
                { endpoint: fridge, matches: [] },
            ]);
        });

        it("limits a tree-pattern Descendant assertion to children", () => {
            const root = rootNode();
            const { fridge } = refrigerator(root, { cabinets: 0 });
            const shelf = light(fridge, "shelf");
            const grandchild = endpoint("grandchild", CABINET, { parent: shelf });

            const collection = collect(root);
            expect(collection.conditionsOf(grandchild).has("Cooler")).false;
            expect(collection.conditionsOf(shelf).has("Cooler")).false;
        });

        it("extends a full-family Descendant assertion to descendants but not into a nested node", () => {
            const root = rootNode();
            const {
                fridge,
                cabinets: [child],
            } = refrigerator(root, { cabinets: 1, fullFamily: true });
            const shelf = light(fridge, "shelf");
            const grandchild = endpoint("grandchild", CABINET, { parent: shelf });
            const nested = endpoint("nested", ROOT_NODE, { parent: fridge });
            const beyond = endpoint("beyond", CABINET, { parent: nested });
            const { fridge: nestedFridge } = refrigerator(nested, { cabinets: 0 });

            const collection = collect(root);

            expect(collection.conditionsOf(child).has("Cooler")).true;
            expect(collection.conditionsOf(grandchild).has("Cooler")).true;
            expect(collection.descendantAssertionsOf(fridge)[0].matches).deep.equals([child, grandchild]);
            expect(collection.conditionsOf(beyond).size).equals(0);
            expect(collection.descendantAssertionsOf(nestedFridge)).deep.equals([]);
        });

        it("covers exactly one node scope", () => {
            const root = rootNode();
            const nested = endpoint("nested", ROOT_NODE, { parent: root });
            const camera = endpoint("camera", standardDeviceType("Camera"), { parent: nested });

            const outer = collect(root);
            expect(outer.conditionsOf(nested).size).equals(0);
            expect(outer.conditionsOf(camera).size).equals(0);
            expect(outer.conditionsOf(root).has("PowerSourceCond")).false;

            const inner = collect(nested);
            expect(inner.conditionsOf(nested).has("PowerSourceCond")).true;
        });

        it("does not read past the collection's node endpoint for a Descendant assertion of a nested scope", () => {
            const root = rootNode();
            const nested = endpoint("nested", ROOT_NODE, { parent: root });
            const camera = endpoint("camera", standardDeviceType("Camera"), { parent: nested });

            using reads = recordingReads();
            collect(nested).conditionsOf(camera);

            expect(reads.read.has(root)).false;
        });

        it("includes a condition the endpoint states", () => {
            const root = rootNode();
            const stating = endpoint("light", ON_OFF_LIGHT, {
                parent: root,
                stated: ["BridgedPowerSourceInfo", "RootNode.PowerSourceCond", "sit"],
            });

            const conditions = collect(root).conditionsOf(stating);

            expect(conditions.has("BridgedPowerSourceInfo")).true;
            expect(conditions.has("PowerSourceCond")).true;
            expect(conditions.has("RootNode.PowerSourceCond")).false;
            expect(conditions.has("sit")).false;
            expect(conditions.has("Sit")).false;
        });
    });

    describe("structural conditions", () => {
        it("derives Node from a node device type", () => {
            const root = rootNode();
            const child = light(root);

            const collection = collect(root);

            expect(collection.conditionsOf(root).has("Node")).true;
            expect(collection.conditionsOf(child).has("Node")).false;
        });

        it("derives App and Simple from a simple device type", () => {
            const root = rootNode();
            const child = light(root);

            const collection = collect(root);

            expect(collection.conditionsOf(child).has("App")).true;
            expect(collection.conditionsOf(child).has("Simple")).true;
            expect(collection.conditionsOf(child).has("Dynamic")).false;
            expect(collection.conditionsOf(root).has("App")).false;
            expect(collection.conditionsOf(root).has("Simple")).false;
        });

        it("derives App and Dynamic from a dynamic device type", () => {
            const root = rootNode();
            const dynamo = endpoint("dynamo", DYNAMIC_ID, { parent: root });

            const conditions = collect(root, fixtureModel()).conditionsOf(dynamo);

            expect(conditions.has("App")).true;
            expect(conditions.has("Dynamic")).true;
            expect(conditions.has("Simple")).false;
        });

        it("derives App from an application device type", () => {
            const root = rootNode();
            const applied = endpoint("applied", APPLICATION_ID, { parent: root });

            const conditions = collect(root, fixtureModel()).conditionsOf(applied);

            expect(conditions.has("App")).true;
            expect(conditions.has("Simple")).false;
            expect(conditions.has("Dynamic")).false;
        });

        it("derives Composed from component device type requirements", () => {
            const root = rootNode();
            const {
                fridge,
                cabinets: [cabinet],
            } = refrigerator(root, { cabinets: 1 });

            const collection = collect(root);

            expect(collection.conditionsOf(fridge).has("Composed")).true;
            expect(collection.conditionsOf(cabinet).has("Composed")).false;
        });

        it("derives Server from an application server cluster", () => {
            const root = rootNode();
            const child = light(root);
            const utilityOnly = lightSwitch(root);

            const collection = collect(root);

            expect(collection.conditionsOf(child).has("Server")).true;

            // Identify is a utility cluster
            expect(collection.conditionsOf(utilityOnly).has("Server")).false;
        });

        it("derives Client from an application client cluster", () => {
            const root = rootNode();
            const child = light(root);
            const client = lightSwitch(root);

            const collection = collect(root);

            expect(collection.conditionsOf(client).has("Client")).true;
            expect(collection.conditionsOf(child).has("Client")).false;
        });

        it("derives Duplicate from siblings sharing an application device type", () => {
            const root = rootNode();
            const first = light(root, "first");
            const second = light(root, "second");
            const other = lightSwitch(root);

            const collection = collect(root);

            expect(collection.conditionsOf(first).has("Duplicate")).true;
            expect(collection.conditionsOf(second).has("Duplicate")).true;
            expect(collection.conditionsOf(other).has("Duplicate")).false;
            expect(collection.conditionsOf(root).has("Duplicate")).false;
        });

        it("does not derive Duplicate from shared utility device types", () => {
            const root = rootNode();
            const powerSource = standardDeviceType("PowerSource");
            const first = endpoint("first", [ON_OFF_LIGHT, powerSource], { parent: root });
            endpoint("switch", [ON_OFF_LIGHT_SWITCH, powerSource], { parent: root });

            expect(collect(root).conditionsOf(first).has("Duplicate")).false;
        });
    });

    describe("node conditions", () => {
        it("holds a node condition the facts state for every endpoint of the node scope", () => {
            const root = rootNode();
            const child = light(root);
            const facts = new FakeFacts();
            facts.nodeConditions.push(NodeCondition.CustomNetworkConfig);

            const collection = collect(root, Matter, facts);

            expect(collection.conditionsOf(root).has(NodeCondition.CustomNetworkConfig)).true;
            expect(collection.conditionsOf(child).has(NodeCondition.CustomNetworkConfig)).true;
        });

        it("does not hold CustomNetworkConfig the facts do not state", () => {
            const root = rootNode();

            expect(collect(root).conditionsOf(root).has(NodeCondition.CustomNetworkConfig)).false;
        });

        for (const [feature, condition] of [
            ["WI", NodeCondition.WiFi],
            ["TH", NodeCondition.Thread],
            ["ET", NodeCondition.Ethernet],
        ] as const) {
            it(`holds ${condition} for every endpoint when NetworkCommissioning supports that interface`, () => {
                const root = networkRoot(feature);
                const child = light(root);

                const collection = collect(root);

                const interfaces = [NodeCondition.WiFi, NodeCondition.Thread, NodeCondition.Ethernet];
                expect(interfaces.filter(name => collection.conditionsOf(root).has(name))).deep.equals([condition]);
                expect(interfaces.filter(name => collection.conditionsOf(child).has(name))).deep.equals([condition]);
            });
        }

        it("holds a network interface condition that a secondary interface's NetworkCommissioning supports", () => {
            const root = rootNode();
            endpoint("thread", standardDeviceType("SecondaryNetworkInterface"), {
                parent: root,
                servers: [standardCluster("NetworkCommissioning", { TH: true })],
            });

            expect(collect(root).conditionsOf(root).has(NodeCondition.Thread)).true;
        });

        it("holds no network interface condition without NetworkCommissioning", () => {
            const root = rootNode();

            const conditions = collect(root).conditionsOf(root);

            expect(conditions.has(NodeCondition.WiFi)).false;
            expect(conditions.has(NodeCondition.Thread)).false;
            expect(conditions.has(NodeCondition.Ethernet)).false;
        });

        it("holds a stated condition the node does not answer", () => {
            const root = endpoint("root", ROOT_NODE, { stated: ["CustomNetworkConfig", "Sit"] });

            const conditions = collect(root).conditionsOf(root);

            expect(conditions.has(NodeCondition.CustomNetworkConfig)).true;
            expect(conditions.has("Sit")).true;
        });
    });

    describe("unknownNames", () => {
        it("accepts a name in the endpoint's scope", () => {
            const stating = endpoint("light", ON_OFF_LIGHT, {
                parent: rootNode(),
                stated: ["BridgedPowerSourceInfo", "RootNode.PowerSourceCond"],
            });

            expect(ConditionAssertions.unknownNames(stating, pass())).deep.equals([]);
        });

        it("suggests the declared spelling of a name that matches only regardless of case", () => {
            const stating = endpoint("light", ON_OFF_LIGHT, {
                parent: rootNode(),
                stated: ["sit", "rootnode.powersourcecond"],
            });

            expect(ConditionAssertions.unknownNames(stating, pass())).deep.equals([
                { name: "sit", suggestion: "Sit" },
                { name: "rootnode.powersourcecond", suggestion: "RootNode.PowerSourceCond" },
            ]);
        });

        it("reports a name that resolves to nothing", () => {
            const stating = endpoint("light", ON_OFF_LIGHT, {
                parent: rootNode(),
                stated: ["Nonsense", "PhysicalInputs"],
            });

            // PhysicalInputs is declared by video players, which are outside the light's scope
            expect(ConditionAssertions.unknownNames(stating, pass())).deep.equals([
                { name: "Nonsense" },
                { name: "PhysicalInputs" },
            ]);
        });

        it("accepts a name two device types of the endpoint both declare", () => {
            const root = rootNode();
            const player = endpoint(
                "player",
                [standardDeviceType("BasicVideoPlayer"), standardDeviceType("CastingVideoPlayer")],
                { parent: root, stated: ["PhysicalInputs"] },
            );

            expect(ConditionAssertions.unknownNames(player, pass())).deep.equals([]);
            expect(collect(root).conditionsOf(player).has("PhysicalInputs")).true;
        });
    });
});

describe("ResolvedEndpoint", () => {
    it("drops the device types the model does not define", () => {
        const listing = endpoint("light", [ON_OFF_LIGHT, 0xfff10099], { parent: rootNode() });

        expect(ResolvedEndpoint.of(listing, pass()).deviceTypes.map(deviceType => deviceType.name)).deep.equals([
            "OnOffLight",
        ]);
    });

    it("names server and client clusters by their model name", () => {
        const root = rootNode();
        const server = light(root);
        const client = lightSwitch(root);

        expect(ResolvedEndpoint.of(server, pass()).servers.has("OnOff")).true;
        expect(ResolvedEndpoint.of(server, pass()).clients.has("OnOff")).false;
        expect(ResolvedEndpoint.of(client, pass()).clients.has("OnOff")).true;
    });

    it("reports features by code", () => {
        const lit = endpoint("light", ON_OFF_LIGHT, {
            parent: rootNode(),
            servers: [standardCluster("OnOff", { LT: true })],
        });

        expect([...ResolvedEndpoint.of(lit, pass()).features("OnOff")]).deep.equals(["LT"]);
        expect(ResolvedEndpoint.of(lit, pass()).features("LevelControl").size).equals(0);
    });

    it("reports the attributes, commands and events a server implements", () => {
        const basicInformation = standardCluster("BasicInformation");
        const root = endpoint("root", ROOT_NODE, { servers: [basicInformation] });
        root.elements.set(basicInformation, {
            attributes: new Set(),
            commands: new Set(),
            events: new Set(["startUp"]),
        });
        const onOff = standardCluster("OnOff", { LT: true });
        const lit = endpoint("light", ON_OFF_LIGHT, { parent: root, servers: [onOff] });
        lit.elements.set(onOff, {
            attributes: new Set(["onTime", "offWaitTime"]),
            commands: new Set(["onWithTimedOff"]),
            events: new Set(),
        });
        const facts = ResolvedEndpoint.of(lit, pass());

        expect(facts.supports("OnOff", memberOf("OnOff", "OnTime"))).true;
        expect(facts.supports("OnOff", memberOf("OnOff", "OnWithTimedOff"))).true;
        expect(facts.supports("OnOff", memberOf("OnOff", "OffWaitTime"))).true;
        expect(ResolvedEndpoint.of(root, pass()).supports("BasicInformation", memberOf("BasicInformation", "StartUp")))
            .true;
        expect(facts.supports("LevelControl", memberOf("LevelControl", "CurrentLevel"))).false;
    });

    it("lists children", () => {
        const { fridge, cabinets } = refrigerator(rootNode());

        expect(ResolvedEndpoint.of(fridge, pass()).children).deep.equals(cabinets);
    });
});

describe("DeviceTypeValidationPass", () => {
    it("resolves each endpoint once per pass", () => {
        const child = light(rootNode());
        const first = pass();

        expect(ResolvedEndpoint.of(child, first)).equals(ResolvedEndpoint.of(child, first));
        expect(ResolvedEndpoint.of(child, first)).not.equals(ResolvedEndpoint.of(child, pass()));
    });

    it("collects each node scope once per pass", () => {
        const root = rootNode();
        light(root);
        const first = pass();

        expect(ConditionAssertions.collect(root, first)).equals(ConditionAssertions.collect(root, first));
        expect(ConditionAssertions.collect(root, first)).not.equals(ConditionAssertions.collect(root, pass()));
    });
});
