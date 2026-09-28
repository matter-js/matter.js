/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Behavior } from "#behavior/Behavior.js";
import { BridgedDeviceBasicInformationServer } from "#behaviors/bridged-device-basic-information";
import { DescriptorServer } from "#behaviors/descriptor";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/Endpoint.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { DeviceTypeConformanceService } from "#node/server/DeviceTypeConformanceService.js";
import { NodeScopeIndex } from "#node/server/NodeScopeIndex.js";
import { Presence, ServerEndpointFacts } from "#node/server/ServerEndpointFacts.js";
import { ImplementationError } from "@matter/general";
import {
    ClusterModel,
    ConditionModel,
    DeviceTypeConformance,
    DeviceTypeModel,
    DeviceTypeValidationPass,
    MatterModel,
    RequirementModel,
} from "@matter/model";
import { NodeId } from "@matter/types";
import { MockServerNode } from "../../node/mock-server-node.js";
import {
    addCabinet,
    addRefrigerator,
    captureLogOf,
    createNode,
    deviceTypeList,
    WiFiCommissioningServer,
} from "./validation-helpers.js";

const DescribedLight = OnOffLightDevice.with(DescriptorServer);
const BridgedLight = OnOffLightDevice.with(DescriptorServer, BridgedDeviceBasicInformationServer);

const DECLARER_ID = 0xfff1_0050;

/**
 * A model in which RootNode is a node that states no requirement, so only Declarer, which declares OnOff a singleton,
 * reaches beyond its subtree.
 */
function declarerModel() {
    const model = new MatterModel(
        {},
        new DeviceTypeModel({ name: "Base", classification: "base" }),
        new DeviceTypeModel({ name: "RootNode", id: 0x16, classification: "node" }),
        new DeviceTypeModel({ name: "OnOffLight", id: OnOffLightDevice.deviceType, classification: "simple" }),
        new DeviceTypeModel(
            { name: "Declarer", id: DECLARER_ID, classification: "simple" },
            new RequirementModel({ name: "OnOff", id: 6, element: "serverCluster", quality: "I" }),
        ),
        new ClusterModel({ name: "OnOff", id: 6 }),
    );
    model.finalize();
    return model;
}

const DUPLICATE_ASSERTER_ID = 0xfff1_0051;
const WIFI_ASSERTER_ID = 0xfff1_0052;

/**
 * A model in which DuplicateAsserter asserts RootNode's Guarded while it shares an application device type with a
 * sibling, WiFiAsserter asserts it while the node supports Wi-Fi, and Declarer declares ColorControl, which no light
 * carries, a singleton.
 */
function assertingModel() {
    const guarded = (conformance: string) =>
        new RequirementModel({
            name: "Guarded",
            type: "RootNode.Guarded",
            element: "condition",
            conformance,
            location: "Root",
        });

    const model = new MatterModel(
        {},
        new DeviceTypeModel(
            { name: "Base", classification: "base" },
            new ConditionModel({ name: "Duplicate" }),
            new ConditionModel({ name: "WiFi" }),
        ),
        new DeviceTypeModel(
            { name: "RootNode", id: 0x16, classification: "node" },
            new ConditionModel({ name: "Guarded" }),
        ),
        new DeviceTypeModel({ name: "OnOffLight", id: OnOffLightDevice.deviceType, classification: "simple" }),
        new DeviceTypeModel(
            { name: "DuplicateAsserter", id: DUPLICATE_ASSERTER_ID, classification: "simple" },
            guarded("Duplicate"),
        ),
        new DeviceTypeModel({ name: "WiFiAsserter", id: WIFI_ASSERTER_ID, classification: "simple" }, guarded("WiFi")),
        new DeviceTypeModel(
            { name: "Declarer", id: DECLARER_ID, classification: "simple" },
            new RequirementModel({ name: "ColorControl", id: 0x300, element: "serverCluster", quality: "I" }),
        ),
        new ClusterModel({ name: "ColorControl", id: 0x300 }),
    );
    model.finalize();
    return model;
}

const WiFiLight = OnOffLightDevice.with(DescriptorServer, WiFiCommissioningServer);

class CrashingBehavior extends Behavior {
    static override readonly id = "crashing";
    static override readonly early = true;

    override initialize() {
        throw new ImplementationError("Crashes on purpose");
    }
}

async function addLight(parent: Endpoint, id: string, ...deviceTypes: (string | number)[]) {
    return parent.add(DescribedLight, {
        id,
        ...(deviceTypes.length ? { descriptor: { deviceTypeList: deviceTypeList(...deviceTypes) } } : {}),
    });
}

async function setDeviceTypes(endpoint: Endpoint, ...deviceTypes: (string | number)[]) {
    await captureLogOf(() => endpoint.set({ descriptor: { deviceTypeList: deviceTypeList(...deviceTypes) } }));
}

describe("NodeScopeIndex", () => {
    before(() => {
        MockTime.init();
    });

    function standaloneIndex() {
        const facts = new ServerEndpointFacts();
        const index = new NodeScopeIndex(facts);
        const pass = () => new DeviceTypeValidationPass(facts, declarerModel(), index);
        return { index, pass };
    }

    it("weighs only the changes noted while it keeps reaching endpoints", async () => {
        const node = await createNode(declarerModel());
        const declarer = await addLight(node, "declarer", DECLARER_ID);
        const { index, pass } = standaloneIndex();

        index.noteChanged(declarer);
        index.reachingOf(node, pass());
        const kept = index.keptOf(node);
        expect(kept).deep.equals([declarer]);

        index.reachingOf(node, pass());
        expect(index.keptOf(node)).equals(kept);

        index.noteChanged(declarer);
        index.reachingOf(node, pass());
        expect(index.keptOf(node)).not.equals(kept);

        await node.close();
    });

    it("weighs each noted change once", async () => {
        const node = await createNode(declarerModel());
        const light = await addLight(node, "light", "OnOffLight");
        const { index, pass } = standaloneIndex();
        index.reachingOf(node, pass());

        index.noteChanged(light);
        index.reachingOf(node, pass());
        const kept = index.keptOf(node);
        expect(kept).deep.equals([]);

        // Not noted this time, so the change weighed while the light reached nothing is not weighed again
        await light.set({ descriptor: { deviceTypeList: deviceTypeList(DECLARER_ID) } });
        index.reachingOf(node, pass());
        expect(index.keptOf(node)).equals(kept);

        await node.close();
    });

    it("forgets the node endpoints that bounded what it discarded", async () => {
        const node = await createNode(declarerModel());
        const nested = await addLight(node, "nested", "RootNode");
        const { index, pass } = standaloneIndex();
        index.reachingOf(node, pass());
        const kept = index.keptOf(node);

        index.noteChanged(nested);
        index.reachingOf(node, pass());
        const rescanned = index.keptOf(node);
        expect(rescanned).not.equals(kept);

        // Rescanned while nested is no node endpoint, so it bounds nothing any more
        await nested.set({ descriptor: { deviceTypeList: deviceTypeList("OnOffLight") } });
        index.noteChanged(nested);
        index.reachingOf(node, pass());
        const unbounded = index.keptOf(node);
        expect(unbounded).not.equals(rescanned);

        index.noteChanged(nested);
        index.reachingOf(node, pass());
        expect(index.keptOf(node)).equals(unbounded);

        await node.close();
    });

    it("discards what it keeps on a change to a bounding node endpoint that reaches nothing", async () => {
        const node = await createNode(declarerModel());
        const light = await addLight(node, "light", "OnOffLight");
        const nested = await addLight(node, "nested", "RootNode");
        const { index, pass } = standaloneIndex();
        index.reachingOf(node, pass());
        const kept = index.keptOf(node);
        expect(pass().reachOf(nested)).equals(DeviceTypeValidationPass.Reach.None);

        index.noteChanged(light);
        index.reachingOf(node, pass());
        expect(index.keptOf(node)).equals(kept);

        index.noteChanged(nested);
        index.reachingOf(node, pass());
        expect(index.keptOf(node)).not.equals(kept);

        await node.close();
    });

    it("drops what it keeps on a reset of the service", async () => {
        const node = await createNode(declarerModel());
        await addLight(node, "declarer", DECLARER_ID);
        const service = node.env.get(DeviceTypeConformanceService);
        const index = requireIndex(node);
        service.validateNodeScope(node);
        expect(index.keptOf(node)).not.undefined;

        service.reset();

        expect(index.keptOf(node)).undefined;

        await node.close();
    });

    it("forgets only the recorded entry of an endpoint, not its listing", async () => {
        const node = await createNode(declarerModel());
        const light = await addLight(node, "light", "OnOffLight");
        const { index } = standaloneIndex();
        index.listingsOf(node);
        index.recorded(light, { duplicate: false, isNodeEndpoint: false, reach: DeviceTypeValidationPass.Reach.None });

        index.forget(light);

        expect(index.entryOf(light)).undefined;
        expect([...index.partsListing(node, OnOffLightDevice.deviceType)]).deep.equals([light]);

        await node.close();
    });

    it("drops a removed endpoint from its owner's listing", async () => {
        const node = await createNode(declarerModel());
        const light = await addLight(node, "light", "OnOffLight");
        const { index } = standaloneIndex();
        expect([...index.partsListing(node, OnOffLightDevice.deviceType)]).deep.equals([light]);

        index.removed(light);

        expect([...index.partsListing(node, OnOffLightDevice.deviceType)]).deep.equals([]);

        await node.close();
    });

    describe("device type listings", () => {
        it("matches a full rescan of the tree after every change", async () => {
            const node = await createNode();
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
            const lights = new Array<Endpoint>();
            for (const id of ["light1", "light2", "light3"]) {
                lights.push(
                    await aggregator.add(BridgedLight, { id, bridgedDeviceBasicInformation: { nodeLabel: id } }),
                );
            }
            expectConsistent(node);

            // A full-family composer whose component device type also appears outside its composition
            await captureLogOf(() => addRefrigerator(node, { cabinets: 0, fullFamily: true }));
            await captureLogOf(() => addCabinet(node, "looseCabinet"));
            expectConsistent(node);

            // Addition
            lights.push(
                await aggregator.add(BridgedLight, {
                    id: "light4",
                    bridgedDeviceBasicInformation: { nodeLabel: "l4" },
                }),
            );
            expectConsistent(node);

            // DeviceTypeList change
            await setDeviceTypes(lights[1], "OnOffLight", "BridgedNode", "TemperatureSensor");
            expectConsistent(node);

            // Destruction
            await captureLogOf(() => lights[0].delete());
            expectConsistent(node);

            // Crash, which leaves the endpoint a part of its parent
            await captureLogOf(() =>
                aggregator
                    .add({ type: OnOffLightDevice.with(CrashingBehavior), id: "crashed", isEssential: false })
                    .catch(() => undefined),
            );
            expect(aggregator.parts.has("crashed")).true;
            expect(new ServerEndpointFacts().presenceOf(aggregator.parts.require("crashed"))).equals(Presence.Crashed);
            expectConsistent(node);

            // Rollback of a refused essential addition
            await captureLogOf(() =>
                aggregator
                    .add({ type: OnOffLightDevice.with(CrashingBehavior), id: "rolledBack" })
                    .catch(() => undefined),
            );
            expect(aggregator.parts.has("rolledBack")).false;
            expectConsistent(node);

            // A nested node endpoint appears and goes away again
            await setDeviceTypes(lights[2], "RootNode");
            expectConsistent(node);
            await setDeviceTypes(lights[2], "OnOffLight", "BridgedNode");
            expectConsistent(node);

            // Factory reset
            await captureLogOf(() => MockTime.resolve(node.erase(), { macrotasks: true }));
            expectConsistent(node);
            await setDeviceTypes(lights[3], "OnOffLight", "BridgedNode", "TemperatureSensor");
            expectConsistent(node);

            await node.close();
        });

        it("keeps a node scope equal to a rescan through changes in several tree positions without walking it again", async () => {
            const node = await createNode(assertingModel());
            const aggregator = await node.add(AggregatorEndpoint, { id: "aggregator" });
            const lights = new Array<Endpoint>();
            for (const id of ["light1", "light2", "light3"]) {
                lights.push(
                    await aggregator.add(BridgedLight, { id, bridgedDeviceBasicInformation: { nodeLabel: id } }),
                );
            }
            const shelf = await addLight(node, "shelf", "OnOffLight");
            const stored = await addLight(shelf, "stored", "OnOffLight");
            expectConsistent(node);

            using scans = countingScans(node);
            const step = async (change: () => Promise<unknown>) => {
                await captureLogOf(change);
                expectConsistent(node);
            };

            // A reaching endpoint is added at depth three, and a Duplicate-gated asserter starts asserting
            const asserter = await addLight(stored, "asserter", DUPLICATE_ASSERTER_ID, "OnOffLight");
            expectConsistent(node);
            await step(() => addLight(stored, "twin", "OnOffLight"));

            // The twin goes away, so the asserter stops asserting
            await step(() => stored.parts.require("twin").delete());

            // A declarer is added directly below the node endpoint and one below the aggregator
            await step(() => addLight(node, "declarer1", DECLARER_ID));
            await step(() => addLight(aggregator, "declarer2", DECLARER_ID));

            // An endpoint supporting Wi-Fi turns on the Wi-Fi-gated assertion of an endpoint that did not change
            await step(() => addLight(aggregator, "wiFiAsserter", WIFI_ASSERTER_ID));
            await step(() =>
                shelf.add(WiFiLight, {
                    id: "wiFi",
                    descriptor: { deviceTypeList: deviceTypeList("OnOffLight") },
                }),
            );
            await step(() => shelf.parts.require("wiFi").delete());

            // DeviceTypeList changes to and from a reaching device type
            await step(() => setDeviceTypes(lights[1], DECLARER_ID, "OnOffLight"));
            await step(() => setDeviceTypes(lights[1], "OnOffLight", "BridgedNode"));

            // A nested node endpoint appears above reaching endpoints, gains a reaching part and goes away again
            await step(() => setDeviceTypes(shelf, "RootNode"));
            await step(() => addLight(shelf, "nestedDeclarer", DECLARER_ID));
            expect(requireIndex(node).keptOf(shelf)).not.undefined;
            await step(() => addLight(shelf, "nestedAsserter", DUPLICATE_ASSERTER_ID, "OnOffLight"));
            await step(() => setDeviceTypes(shelf, "OnOffLight"));

            // A nested node endpoint below the aggregator, removed with its subtree
            await step(() => setDeviceTypes(lights[2], "RootNode"));
            await step(() => addLight(lights[2], "inner", DUPLICATE_ASSERTER_ID));
            await step(() => lights[2].delete());

            // The node endpoint's own device types start and stop reaching
            await step(() => setDeviceTypes(node, "RootNode", DECLARER_ID));
            await step(() => setDeviceTypes(node, "RootNode"));

            // A reaching endpoint and the subtree above one are destroyed
            await step(() => asserter.delete());
            await step(() => shelf.delete());
            expect(scans.count).equals(0);

            await node.close();
        });

        it("lists neither a peer nor its endpoints, which no scope walk reaches", async () => {
            const node = await createNode();
            const fabric = await node.addFabric();
            const address = { fabricIndex: fabric.fabricIndex, nodeId: NodeId(BigInt(fabric.nodeId) + 1n) };
            await node.peers.forAddress(address);
            const peer = node.peers.get(address);
            if (peer === undefined) {
                throw new ImplementationError("Test peer is missing");
            }
            const endpoint = peer.endpoints.require(1);
            await endpoint.construction.ready;

            const facts = new ServerEndpointFacts();
            expect(facts.presenceOf(peer)).equals(Presence.Detached);

            const pass = new DeviceTypeValidationPass(facts, node.matter, requireIndex(node));
            const scope = pass.nodeScopeOf(node);
            expect(scope.includes(peer) || scope.includes(endpoint)).false;
            for (const listed of requireIndex(node).listingsOf(node).values()) {
                expect(listed.has(peer)).false;
            }

            await node.close();
        });
    });
});

function requireIndex(node: MockServerNode) {
    const { index } = node.env.get(DeviceTypeConformanceService);
    if (index === undefined) {
        throw new ImplementationError("Test node keeps no scope index");
    }
    return index;
}

/**
 * Asserts that what the index of {@link node} keeps equals what a rescan of the tree finds: the parts of every endpoint
 * by device type, and the reaching endpoints of the node scope.
 */
function expectConsistent(node: MockServerNode) {
    const index = requireIndex(node);
    const facts = new ServerEndpointFacts();

    const visit = (parent: Endpoint) => {
        const expected = new Map<number, Endpoint[]>();
        for (const part of facts.partsOf(parent)) {
            const presence = facts.presenceOf(part);
            if (presence === Presence.Detached || presence === Presence.Crashed) {
                continue;
            }
            for (const id of facts.deviceTypeIdsOf(part)) {
                const listed = expected.get(id) ?? [];
                listed.push(part);
                expected.set(id, listed);
            }
        }

        const actual = new Map([...index.listingsOf(parent)].map(([id, parts]) => [id, [...parts]]));
        expect(listingText(actual), `listings of ${parent}`).deep.equals(listingText(expected));

        for (const part of facts.partsOf(parent)) {
            visit(part);
        }
    };
    visit(node);

    const pass = new DeviceTypeValidationPass(facts, node.matter, index);
    const rescan = new DeviceTypeValidationPass(facts, node.matter);
    index.reachingOf(node, pass);
    expectScopeConsistent(node, index, pass, rescan);

    // A nested node scope is compared only once a pass read it
    const nested = (endpoint: Endpoint): Endpoint[] =>
        [...facts.partsOf(endpoint)].flatMap(part => [
            ...(part !== node && pass.isNodeEndpoint(part) && index.keptOf(part) !== undefined ? [part] : []),
            ...nested(part),
        ]);
    for (const nodeEndpoint of nested(node)) {
        index.reachingOf(nodeEndpoint, pass);
        expectScopeConsistent(nodeEndpoint, index, pass, rescan);
    }
}

function expectScopeConsistent(
    node: Endpoint,
    index: NodeScopeIndex,
    pass: DeviceTypeValidationPass<Endpoint>,
    rescan: DeviceTypeValidationPass<Endpoint>,
) {
    const facts = pass.facts;
    const kept = index.keptOf(node) ?? [];
    expect(kept.map(String), `reaching endpoints of ${node}`).deep.equals(
        rescan.scanReaching(node).reaching.map(String),
    );

    const scope = rescan.nodeScopeOf(node);
    const expected = new Map<number, Endpoint[]>();
    for (const endpoint of scope) {
        for (const id of facts.deviceTypeIdsOf(endpoint)) {
            expected.set(id, [...(expected.get(id) ?? []), endpoint]);
        }
    }
    const listing = new Map([...(index.keptListingOf(node) ?? [])].map(([id, endpoints]) => [id, [...endpoints]]));
    expect(listingText(listing), "node scope listing").deep.equals(listingText(expected));

    expect([...pass.nodeEndpointConditionsOf(node)].sort(), "node conditions").deep.equals(
        [...rescan.nodeEndpointConditionsOf(node)].sort(),
    );
    for (const endpoint of scope) {
        expect(verdictText(endpoint, pass), `verdict of ${endpoint}`).deep.equals(verdictText(endpoint, rescan));
    }
}

function verdictText(endpoint: Endpoint, pass: DeviceTypeValidationPass<Endpoint>) {
    return DeviceTypeConformance.check(endpoint, pass).map(
        ({ kind, deviceType, requirement, detail }) => `${kind} ${deviceType} ${requirement}: ${detail}`,
    );
}

/**
 * Counts the walks of the node scope of {@link node} that passes with a scope index make to collect its reaching
 * endpoints, until disposed.
 */
function countingScans(node: Endpoint) {
    const { scanReaching } = DeviceTypeValidationPass.prototype;
    const counter = {
        count: 0,

        [Symbol.dispose]() {
            DeviceTypeValidationPass.prototype.scanReaching = scanReaching;
        },
    };

    DeviceTypeValidationPass.prototype.scanReaching = function (this: DeviceTypeValidationPass<unknown>, nodeEndpoint) {
        if (this.index !== undefined && nodeEndpoint === node) {
            counter.count++;
        }
        return scanReaching.call(this, nodeEndpoint);
    };

    return counter;
}

function listingText(listings: Map<number, Endpoint[]>) {
    return [...listings].map(([id, parts]) => `${id}: ${parts.map(String).sort().join(", ")}`).sort();
}
