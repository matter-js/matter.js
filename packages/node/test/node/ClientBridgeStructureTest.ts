/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BridgedDeviceBasicInformationServer } from "#behaviors/bridged-device-basic-information";
import { OnOffLightDevice } from "#devices/on-off-light";
import { TemperatureSensorDevice } from "#devices/temperature-sensor";
import { Endpoint } from "#endpoint/Endpoint.js";
import { EndpointInitializer } from "#endpoint/properties/EndpointInitializer.js";
import { AggregatorEndpoint } from "#endpoints/aggregator";
import { BridgedNodeEndpoint } from "#endpoints/bridged-node";
import type { ClientEndpointInitializer } from "#node/client/ClientEndpointInitializer.js";
import { ServerNode } from "#node/ServerNode.js";
import { AcceptedCommandList, AttributeList, ClusterRevision, FeatureMap, GeneratedCommandList } from "@matter/model";
import { Read, ReadResult } from "@matter/protocol";
import { AttributeId, EndpointNumber, TlvAny } from "@matter/types";
import { Descriptor } from "@matter/types/clusters/descriptor";
import { MockSite } from "./mock-site.js";

const BridgedLightDevice = OnOffLightDevice.with(BridgedDeviceBasicInformationServer);

/**
 * A bridge of the shape the bridge test plans use: an aggregator carrying a composed device with two
 * sensors of its own, and a light beside it.
 *
 * An aggregator names every descendant in its `PartsList` (Matter Core § 9.2.3's full-family
 * pattern), so the sensors appear both there and in the composed device's own list. Which endpoint
 * owns them cannot be read off either list alone.
 */
async function bridgeSite() {
    const site = new MockSite();

    const { controller, device } = await site.addCommissionedPair({
        device: {
            type: ServerNode.RootEndpoint,
            parts: [
                {
                    id: "aggregator",
                    type: AggregatorEndpoint,
                    parts: [
                        {
                            id: "composed",
                            type: BridgedNodeEndpoint,
                            parts: [
                                { id: "sensor1", type: TemperatureSensorDevice },
                                { id: "sensor2", type: TemperatureSensorDevice },
                            ],
                        },
                        { id: "light", type: BridgedLightDevice },
                    ],
                },
            ],
        },
    });

    const peer = controller.peers.get("peer1")!;
    const aggregator = device.parts.require("aggregator");
    const composed = aggregator.parts.require("composed");

    return { site, peer, aggregator, composed };
}

function clientPart(parent: Endpoint, server: Endpoint) {
    return parent.parts.get(`ep${server.number}`);
}

describe("a peer that is a bridge", () => {
    before(() => {
        MockTime.init();
    });

    it("puts a composed device's parts below it rather than below the aggregator", async () => {
        const { site, peer, aggregator, composed } = await bridgeSite();
        await using _site = site;

        const aggregatorClient = clientPart(peer, aggregator)!;
        expect(aggregatorClient).not.undefined;

        const composedClient = clientPart(aggregatorClient, composed);
        expect(composedClient).not.undefined;

        expect(clientPart(composedClient!, composed.parts.require("sensor1"))).not.undefined;
        expect(clientPart(composedClient!, composed.parts.require("sensor2"))).not.undefined;

        // The aggregator names all four in its own list, but owns only the two it composes
        expect(aggregatorClient.parts.size).equals(2);
        expect(composedClient!.parts.size).equals(2);
    });

    it("puts a sensor the bridge adds to a composed device below that device", async () => {
        const { site, peer, aggregator, composed } = await bridgeSite();
        await using _site = site;

        const aggregatorClient = clientPart(peer, aggregator)!;
        const composedClient = clientPart(aggregatorClient, composed)!;

        const added = Promise.resolve(composedClient.parts.added);
        const sensorServer = new Endpoint(TemperatureSensorDevice);
        await composed.add(sensorServer);

        const sensorClient = await MockTime.resolve(added);
        expect(sensorClient.number).equals(sensorServer.number);
        expect(composedClient.parts.size).equals(3);
        expect(aggregatorClient.parts.size).equals(2);

        const destroyed = Promise.resolve(sensorClient.lifecycle.destroyed);
        await sensorServer.delete();
        await MockTime.resolve(destroyed);

        expect(composedClient.parts.size).equals(2);
    });
});

/**
 * The bridge above, as a peer would report it: an aggregator on 20, a composed device on 21, and the
 * two sensors it owns on 22 and 23.
 */
const AGGREGATOR = 20;
const COMPOSED = 21;
const SENSORS = [22, 23];

/** Matter Core § 9.11's Power Source device type, which chip puts on its composed device. */
const POWER_SOURCE_DEVICE_TYPE = 0x0011;

const DESCRIPTOR_GLOBALS = [
    GeneratedCommandList.id,
    AcceptedCommandList.id,
    AttributeList.id,
    FeatureMap.id,
    ClusterRevision.id,
];

function descriptorAttr(endpointId: number, attributeId: number, value: unknown, version: number): ReadResult.Report {
    return {
        kind: "attr-value",
        path: {
            endpointId: EndpointNumber(endpointId),
            clusterId: Descriptor.id,
            attributeId: attributeId as AttributeId,
        },
        value,
        version,
        tlv: TlvAny,
    };
}

/** A whole Descriptor cluster for an endpoint the peer has not reported before. */
function descriptorReports(
    endpointId: number,
    deviceType: number | { deviceType: number; revision: number }[],
    revision: number,
    partsList: number[],
    version: number,
): ReadResult.Report[] {
    const attr = (attributeId: number, value: unknown) => descriptorAttr(endpointId, attributeId, value, version);
    const deviceTypeList = typeof deviceType === "number" ? [{ deviceType, revision }] : deviceType;
    return [
        attr(ClusterRevision.id, 3),
        attr(FeatureMap.id, {}),
        attr(AttributeList.id, [0, 1, 2, 3, ...DESCRIPTOR_GLOBALS]),
        attr(AcceptedCommandList.id, []),
        attr(GeneratedCommandList.id, []),
        attr(Descriptor.attributes.deviceTypeList.id, deviceTypeList),
        attr(Descriptor.attributes.serverList.id, [Descriptor.id]),
        attr(Descriptor.attributes.clientList.id, []),
        attr(Descriptor.attributes.partsList.id, partsList),
    ];
}

async function* readResult(...chunks: ReadResult.Report[][]): ReadResult {
    for (const chunk of chunks) {
        yield chunk;
    }
}

async function drain(updates: AsyncGenerator<unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of updates) {
    }
}

describe("a peer that reports its bridge across two interactions", () => {
    before(() => {
        MockTime.init();
    });

    /**
     * The root endpoint composes its `PartsList` of every descendant, so a read that carries the root's
     * list and nothing else names the whole bridge without saying who owns what. Taking that list as a
     * statement of parenthood puts every endpoint directly below the root, and nothing can move them
     * afterwards: an endpoint has one parent for its life.
     *
     * A truncated read is how this arises in practice — a peer that stops answering mid-interaction
     * leaves exactly this state — so the claims have to survive to the interaction that settles them.
     */
    it("waits for the lists that say who owns what rather than reading the root's as parenthood", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ device: { type: ServerNode.RootEndpoint } });
        const peer = controller.peers.get("peer1")!;

        const structure = (peer.env.get(EndpointInitializer) as ClientEndpointInitializer).structure;
        const request = Read({ attributes: [{}], fabricFilter: structure.subscribedFabricFiltered });

        // *** THE ROOT'S LIST, AND NOTHING ELSE ***

        await drain(
            structure.mutate(
                request,
                readResult([
                    descriptorAttr(0, Descriptor.attributes.partsList.id, [AGGREGATOR, COMPOSED, ...SENSORS], 10),
                ]),
            ),
        );

        // *** THE LISTS THAT SETTLE IT ***

        await drain(
            structure.mutate(
                request,
                readResult(
                    descriptorReports(AGGREGATOR, AggregatorEndpoint.deviceType, 3, [COMPOSED, ...SENSORS], 11),
                    descriptorReports(COMPOSED, BridgedNodeEndpoint.deviceType, 1, SENSORS, 11),
                    ...SENSORS.map(number => descriptorReports(number, TemperatureSensorDevice.deviceType, 2, [], 11)),
                ),
            ),
        );

        const aggregator = peer.parts.get(`ep${AGGREGATOR}`);
        expect(aggregator, "the aggregator belongs to the root").not.undefined;

        const composed = aggregator!.parts.get(`ep${COMPOSED}`);
        expect(composed, "the composed device belongs to the aggregator").not.undefined;

        for (const number of SENSORS) {
            expect(composed!.parts.get(`ep${number}`), `endpoint ${number} belongs to the composed device`).not
                .undefined;
        }

        expect(peer.parts.size).equals(1);
        expect(aggregator!.parts.size).equals(1);
        expect(composed!.parts.size).equals(SENSORS.length);
    });

    it("does not install a part the root has stopped naming while its owner was unknown", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ device: { type: ServerNode.RootEndpoint } });
        const peer = controller.peers.get("peer1")!;

        const structure = (peer.env.get(EndpointInitializer) as ClientEndpointInitializer).structure;
        const request = Read({ attributes: [{}], fabricFilter: structure.subscribedFabricFiltered });

        // The whole bridge, named by the root alone: every part is claimed and none can be placed yet
        await drain(
            structure.mutate(
                request,
                readResult([
                    descriptorAttr(0, Descriptor.attributes.partsList.id, [AGGREGATOR, COMPOSED, ...SENSORS], 10),
                ]),
            ),
        );

        // The peer drops one sensor from the root's list — the list that says what the node has — but
        // the composed device it hung from has not caught up and still names it. The claim therefore
        // survives and becomes decidable in this same interaction.
        const kept = SENSORS[0];
        const dropped = SENSORS[1];
        await drain(
            structure.mutate(
                request,
                readResult(
                    [descriptorAttr(0, Descriptor.attributes.partsList.id, [AGGREGATOR, COMPOSED, kept], 11)],
                    descriptorReports(AGGREGATOR, AggregatorEndpoint.deviceType, 3, [COMPOSED, kept], 11),
                    descriptorReports(COMPOSED, BridgedNodeEndpoint.deviceType, 1, [kept, dropped], 11),
                    descriptorReports(kept, TemperatureSensorDevice.deviceType, 2, [], 11),
                    descriptorReports(dropped, TemperatureSensorDevice.deviceType, 2, [], 11),
                ),
            ),
        );

        const aggregator = peer.parts.get(`ep${AGGREGATOR}`);
        const composed = aggregator?.parts.get(`ep${COMPOSED}`);
        expect(composed, "the composed device belongs to the aggregator").not.undefined;
        expect(composed!.parts.get(`ep${kept}`), `endpoint ${kept} is still on the node`).not.undefined;
        expect(composed!.parts.get(`ep${dropped}`), `endpoint ${dropped} is not`).undefined;
    });

    it("takes the device types of an endpoint that has only utility ones", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ device: { type: ServerNode.RootEndpoint } });
        const peer = controller.peers.get("peer1")!;

        const structure = (peer.env.get(EndpointInitializer) as ClientEndpointInitializer).structure;
        const request = Read({ attributes: [{}], fabricFilter: structure.subscribedFabricFiltered });

        // chip's composed device: a bridged node that is also a power source, and nothing else. Named
        // by the root first, so the endpoint exists carrying the unknown sentinel before its own
        // Descriptor arrives.
        await drain(
            structure.mutate(
                request,
                readResult([descriptorAttr(0, Descriptor.attributes.partsList.id, [COMPOSED], 10)]),
            ),
        );

        await drain(
            structure.mutate(
                request,
                readResult(
                    descriptorReports(
                        COMPOSED,
                        [
                            { deviceType: BridgedNodeEndpoint.deviceType, revision: 1 },
                            { deviceType: POWER_SOURCE_DEVICE_TYPE, revision: 1 },
                        ],
                        1,
                        [],
                        11,
                    ),
                ),
            ),
        );

        const composed = peer.parts.get(`ep${COMPOSED}`);
        expect(composed, "the composed device is on the node").not.undefined;
        expect(composed!.type.deviceType).equals(BridgedNodeEndpoint.deviceType);
    });

    it("installs nothing from a full-family list alone", async () => {
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair({ device: { type: ServerNode.RootEndpoint } });
        const peer = controller.peers.get("peer1")!;

        const structure = (peer.env.get(EndpointInitializer) as ClientEndpointInitializer).structure;
        const request = Read({ attributes: [{}], fabricFilter: structure.subscribedFabricFiltered });

        await drain(
            structure.mutate(
                request,
                readResult([
                    descriptorAttr(0, Descriptor.attributes.partsList.id, [AGGREGATOR, COMPOSED, ...SENSORS], 10),
                ]),
            ),
        );

        expect(peer.parts.size).equals(0);
    });
});

/**
 * A peer whose root does not name every endpoint it serves.
 *
 * Matter Core § 9.2.3 defines descendants of an endpoint as those in its `PartsList` plus their
 * descendants, and a root node composes its list of every one of them. An endpoint the root omits is
 * therefore not part of the tree the peer describes, however well it answers reads — so it is left
 * out, and the parts it claims belong to whoever else claims them.
 */
describe("a peer whose root omits an endpoint it serves", () => {
    before(() => {
        MockTime.init();
    });

    const AGGREGATOR_EP = 1;
    const PLUGS = [2, 3];
    const ON_OFF_PLUG_IN_UNIT = 0x010a;

    async function report(rootFirst: boolean) {
        const site = new MockSite();
        const { controller } = await site.addCommissionedPair({ device: { type: ServerNode.RootEndpoint } });
        const peer = controller.peers.get("peer1")!;
        const structure = (peer.env.get(EndpointInitializer) as ClientEndpointInitializer).structure;
        const request = Read({ attributes: [{}], fabricFilter: structure.subscribedFabricFiltered });

        // The root names only the plugs; the aggregator names them too but nothing names the aggregator
        const root = [descriptorAttr(0, Descriptor.attributes.partsList.id, PLUGS, 10)];
        const aggregator = descriptorReports(AGGREGATOR_EP, AggregatorEndpoint.deviceType, 1, PLUGS, 10);
        const plugs = PLUGS.map(number => descriptorReports(number, ON_OFF_PLUG_IN_UNIT, 3, [], 10));

        await drain(
            structure.mutate(
                request,
                rootFirst ? readResult(root, aggregator, ...plugs) : readResult(aggregator, root, ...plugs),
            ),
        );

        return { site, peer };
    }

    function expectPlugsOnTheRoot(peer: Endpoint) {
        expect(peer.parts.get(`ep${AGGREGATOR_EP}`), "the endpoint the root omits is not on the node").undefined;

        for (const number of PLUGS) {
            expect(peer.parts.get(`ep${number}`), `endpoint ${number} belongs to the root`).not.undefined;
        }

        expect(peer.parts.size).equals(PLUGS.length);
    }

    it("leaves it out, and keeps the endpoints it claims", async () => {
        const { site, peer } = await report(true);
        await using _site = site;

        expectPlugsOnTheRoot(peer);
    });

    // The omitted endpoint and the root are both full-family claimants of the plugs, and neither names
    // the other, so nothing but arrival order distinguished them
    it("does the same when it reports itself before the root", async () => {
        const { site, peer } = await report(false);
        await using _site = site;

        expectPlugsOnTheRoot(peer);
    });
});

describe("a peer that changes what it says between interactions", () => {
    before(() => {
        MockTime.init();
    });

    async function peerOf() {
        const site = new MockSite();
        const { controller } = await site.addCommissionedPair({ device: { type: ServerNode.RootEndpoint } });
        const peer = controller.peers.get("peer1")!;
        const structure = (peer.env.get(EndpointInitializer) as ClientEndpointInitializer).structure;
        const request = Read({ attributes: [{}], fabricFilter: structure.subscribedFabricFiltered });
        return { site, peer, structure, request };
    }

    function treeOf(peer: Endpoint) {
        const seen = new Array<string>();
        const walk = (endpoint: Endpoint, path: string) => {
            for (const part of endpoint.parts) {
                seen.push(`${path}/ep${part.number}`);
                walk(part, `${path}/ep${part.number}`);
            }
        };
        walk(peer, "");
        return seen;
    }

    it("keeps an endpoint the root stopped naming while it holds endpoints the root names", async () => {
        const { site, peer, structure, request } = await peerOf();
        await using _site = site;

        await drain(
            structure.mutate(
                request,
                readResult(
                    [descriptorAttr(0, Descriptor.attributes.partsList.id, [AGGREGATOR, ...SENSORS], 10)],
                    descriptorReports(AGGREGATOR, AggregatorEndpoint.deviceType, 3, SENSORS, 10),
                    ...SENSORS.map(number => descriptorReports(number, TemperatureSensorDevice.deviceType, 2, [], 10)),
                ),
            ),
        );
        expect(treeOf(peer)).deep.equals([`/ep${AGGREGATOR}`, ...SENSORS.map(n => `/ep${AGGREGATOR}/ep${n}`)]);

        // The root drops the aggregator but still names the sensors below it. Erasing it would close
        // them too and nothing can move them first, so it stays and they stay with it.
        await drain(
            structure.mutate(request, readResult([descriptorAttr(0, Descriptor.attributes.partsList.id, SENSORS, 11)])),
        );

        expect(treeOf(peer)).deep.equals([`/ep${AGGREGATOR}`, ...SENSORS.map(n => `/ep${AGGREGATOR}/ep${n}`)]);

        // Once the peer stops naming them too, it goes and takes them with it
        await drain(
            structure.mutate(request, readResult([descriptorAttr(0, Descriptor.attributes.partsList.id, [], 12)])),
        );

        expect(treeOf(peer)).deep.equals([]);
    });

    it("waits for a claimant's device types before reading its list as parenthood", async () => {
        const { site, peer, structure, request } = await peerOf();
        await using _site = site;

        // The aggregator's parts arrive before it says what it is. Read as an ordinary endpoint it
        // would take the sensors as its children, which a later device type could not undo.
        await drain(
            structure.mutate(
                request,
                readResult(
                    [descriptorAttr(0, Descriptor.attributes.partsList.id, [AGGREGATOR, COMPOSED, ...SENSORS], 10)],
                    [descriptorAttr(AGGREGATOR, Descriptor.attributes.partsList.id, [COMPOSED, ...SENSORS], 10)],
                    [descriptorAttr(COMPOSED, Descriptor.attributes.partsList.id, SENSORS, 10)],
                    ...SENSORS.map(number => descriptorReports(number, TemperatureSensorDevice.deviceType, 2, [], 10)),
                ),
            ),
        );
        // The aggregator is claimed by the root alone, which has said what it is, so it is placed.
        // Everything below waits on the aggregator's own device types.
        expect(treeOf(peer)).deep.equals([`/ep${AGGREGATOR}`]);

        await drain(
            structure.mutate(
                request,
                readResult(
                    descriptorReports(AGGREGATOR, AggregatorEndpoint.deviceType, 3, [COMPOSED, ...SENSORS], 11),
                    descriptorReports(COMPOSED, BridgedNodeEndpoint.deviceType, 1, SENSORS, 11),
                ),
            ),
        );

        expect(treeOf(peer)).deep.equals([
            `/ep${AGGREGATOR}`,
            `/ep${AGGREGATOR}/ep${COMPOSED}`,
            ...SENSORS.map(number => `/ep${AGGREGATOR}/ep${COMPOSED}/ep${number}`),
        ]);
    });

    // The endpoint's own type is settled by the first application device type in the list, but how it
    // composes its list is a property of all of them — as `DescriptorServer` decides for an endpoint of
    // our own, which the two have to agree about
    it("reads a full-family device type that follows an application one", async () => {
        const { site, peer, structure, request } = await peerOf();
        await using _site = site;

        await drain(
            structure.mutate(
                request,
                readResult(
                    [descriptorAttr(0, Descriptor.attributes.partsList.id, [AGGREGATOR, COMPOSED, ...SENSORS], 10)],
                    descriptorReports(
                        AGGREGATOR,
                        [
                            { deviceType: OnOffLightDevice.deviceType, revision: 3 },
                            { deviceType: AggregatorEndpoint.deviceType, revision: 3 },
                        ],
                        3,
                        [COMPOSED, ...SENSORS],
                        10,
                    ),
                    descriptorReports(COMPOSED, BridgedNodeEndpoint.deviceType, 1, SENSORS, 10),
                    ...SENSORS.map(number => descriptorReports(number, TemperatureSensorDevice.deviceType, 2, [], 10)),
                ),
            ),
        );

        // Read as a tree, the aggregator would take the sensors as its own children rather than
        // leaving them to the composed device that names them
        expect(treeOf(peer)).deep.equals([
            `/ep${AGGREGATOR}`,
            `/ep${AGGREGATOR}/ep${COMPOSED}`,
            ...SENSORS.map(number => `/ep${AGGREGATOR}/ep${COMPOSED}/ep${number}`),
        ]);
    });

    it("does not let an endpoint keep a claim its own list has dropped", async () => {
        const { site, peer, structure, request } = await peerOf();
        await using _site = site;

        const [kept, moved] = SENSORS;

        // Both sensors are named by the root and by the composed device, but nothing can be placed
        // yet: the composed device has not said what it is
        await drain(
            structure.mutate(
                request,
                readResult(
                    [descriptorAttr(0, Descriptor.attributes.partsList.id, [COMPOSED, ...SENSORS], 10)],
                    [descriptorAttr(COMPOSED, Descriptor.attributes.partsList.id, SENSORS, 10)],
                    ...SENSORS.map(number => descriptorReports(number, TemperatureSensorDevice.deviceType, 2, [], 10)),
                ),
            ),
        );
        expect(treeOf(peer)).deep.equals([`/ep${COMPOSED}`]);

        // The composed device drops one sensor and says what it is. The dropped claim must not still
        // put that sensor below it.
        await drain(
            structure.mutate(
                request,
                readResult(descriptorReports(COMPOSED, BridgedNodeEndpoint.deviceType, 1, [kept], 11)),
            ),
        );

        const composed = peer.parts.get(`ep${COMPOSED}`);
        expect(composed, "the composed device is on the node").not.undefined;
        expect(composed!.parts.get(`ep${kept}`), `endpoint ${kept} is still its part`).not.undefined;
        expect(composed!.parts.get(`ep${moved}`), `endpoint ${moved} is not`).undefined;
        expect(peer.parts.get(`ep${moved}`), `endpoint ${moved} belongs to the root instead`).not.undefined;
    });
});

/**
 * Matter Device Library § 11.2's "Multiple aggregators": an aggregator that is itself bridged,
 * below another aggregator, each one naming every endpoint below it.
 */
const NestedAggregatorDevice = AggregatorEndpoint.with(BridgedDeviceBasicInformationServer);

async function nestedBridgeSite() {
    const site = new MockSite();

    const { controller, device } = await site.addCommissionedPair({
        device: {
            type: ServerNode.RootEndpoint,
            parts: [
                {
                    id: "zigbee",
                    type: AggregatorEndpoint,
                    parts: [
                        { id: "white", type: BridgedLightDevice },
                        { id: "color", type: BridgedLightDevice },
                        {
                            id: "dali",
                            type: NestedAggregatorDevice,
                            parts: [
                                { id: "dali1", type: BridgedLightDevice },
                                { id: "dali2", type: BridgedLightDevice },
                                { id: "dali3", type: BridgedLightDevice },
                            ],
                        },
                    ],
                },
                {
                    id: "zwave",
                    type: AggregatorEndpoint,
                    parts: [
                        { id: "zwave1", type: BridgedLightDevice },
                        { id: "zwave2", type: BridgedLightDevice },
                    ],
                },
            ],
        },
    });

    const peer = controller.peers.get("peer1")!;
    return { site, peer, device };
}

describe("a peer that nests an aggregator below an aggregator", () => {
    before(() => {
        MockTime.init();
    });

    it("keeps each aggregator's own devices below it", async () => {
        const { site, peer, device } = await nestedBridgeSite();
        await using _site = site;

        const zigbee = device.parts.require("zigbee");
        const dali = zigbee.parts.require("dali");
        const zwave = device.parts.require("zwave");

        const zigbeeClient = clientPart(peer, zigbee);
        expect(zigbeeClient, "the outer aggregator belongs to the root").not.undefined;

        const daliClient = clientPart(zigbeeClient!, dali);
        expect(daliClient, "the nested aggregator belongs to the outer aggregator").not.undefined;

        for (const id of ["white", "color"]) {
            expect(clientPart(zigbeeClient!, zigbee.parts.require(id)), `${id} belongs to the outer aggregator`).not
                .undefined;
        }

        for (const id of ["dali1", "dali2", "dali3"]) {
            expect(clientPart(daliClient!, dali.parts.require(id)), `${id} belongs to the nested aggregator`).not
                .undefined;
        }

        const zwaveClient = clientPart(peer, zwave);
        expect(zwaveClient, "the second aggregator belongs to the root").not.undefined;
        for (const id of ["zwave1", "zwave2"]) {
            expect(clientPart(zwaveClient!, zwave.parts.require(id)), `${id} belongs to the second aggregator`).not
                .undefined;
        }

        expect(zigbeeClient!.parts.size).equals(3);
        expect(daliClient!.parts.size).equals(3);
        expect(zwaveClient!.parts.size).equals(2);
    });

    it("reports the nested aggregator as an aggregator", async () => {
        const { site, peer, device } = await nestedBridgeSite();
        await using _site = site;

        const dali = device.parts.require("zigbee").parts.require("dali");
        const daliClient = clientPart(clientPart(peer, device.parts.require("zigbee"))!, dali)!;

        expect(daliClient.type.deviceType).equals(AggregatorEndpoint.deviceType);
    });
});

/**
 * The bridge of Matter Device Library § 11.2's "Multiple aggregators", as a peer reports it.
 */
const ZIGBEE_AGGREGATOR = 11;
const ZIGBEE_LIGHTS = [12, 13];
const DALI_AGGREGATOR = 14;
const DALI_LIGHTS = [21, 22, 23];
const ZWAVE_AGGREGATOR = 31;
const ZWAVE_LIGHTS = [32, 33];

const DIMMABLE_LIGHT_DEVICE_TYPE = 0x0101;

/** An endpoint that is a bridged node and an aggregator, as the nested aggregator of § 11.2 is. */
const BRIDGED_AGGREGATOR_TYPES = [
    { deviceType: BridgedNodeEndpoint.deviceType, revision: 3 },
    { deviceType: AggregatorEndpoint.deviceType, revision: 2 },
];

function nestedBridgeReports(version: number) {
    return [
        descriptorReports(
            ZIGBEE_AGGREGATOR,
            AggregatorEndpoint.deviceType,
            2,
            [...ZIGBEE_LIGHTS, DALI_AGGREGATOR, ...DALI_LIGHTS],
            version,
        ),
        ...ZIGBEE_LIGHTS.map(number =>
            descriptorReports(
                number,
                [
                    { deviceType: BridgedNodeEndpoint.deviceType, revision: 3 },
                    { deviceType: DIMMABLE_LIGHT_DEVICE_TYPE, revision: 3 },
                ],
                3,
                [],
                version,
            ),
        ),
        descriptorReports(DALI_AGGREGATOR, BRIDGED_AGGREGATOR_TYPES, 2, DALI_LIGHTS, version),
        ...DALI_LIGHTS.map(number =>
            descriptorReports(
                number,
                [
                    { deviceType: BridgedNodeEndpoint.deviceType, revision: 3 },
                    { deviceType: DIMMABLE_LIGHT_DEVICE_TYPE, revision: 3 },
                ],
                3,
                [],
                version,
            ),
        ),
        descriptorReports(ZWAVE_AGGREGATOR, AggregatorEndpoint.deviceType, 2, ZWAVE_LIGHTS, version),
        ...ZWAVE_LIGHTS.map(number =>
            descriptorReports(
                number,
                [
                    { deviceType: BridgedNodeEndpoint.deviceType, revision: 3 },
                    { deviceType: DIMMABLE_LIGHT_DEVICE_TYPE, revision: 3 },
                ],
                3,
                [],
                version,
            ),
        ),
    ];
}

const NESTED_BRIDGE_TREE = [
    `/ep${ZIGBEE_AGGREGATOR}`,
    ...ZIGBEE_LIGHTS.map(number => `/ep${ZIGBEE_AGGREGATOR}/ep${number}`),
    `/ep${ZIGBEE_AGGREGATOR}/ep${DALI_AGGREGATOR}`,
    ...DALI_LIGHTS.map(number => `/ep${ZIGBEE_AGGREGATOR}/ep${DALI_AGGREGATOR}/ep${number}`),
    `/ep${ZWAVE_AGGREGATOR}`,
    ...ZWAVE_LIGHTS.map(number => `/ep${ZWAVE_AGGREGATOR}/ep${number}`),
];

describe("a peer that reports an aggregator below an aggregator", () => {
    before(() => {
        MockTime.init();
    });

    async function peerOf() {
        const site = new MockSite();
        const { controller } = await site.addCommissionedPair({ device: { type: ServerNode.RootEndpoint } });
        const peer = controller.peers.get("peer1")!;
        const structure = (peer.env.get(EndpointInitializer) as ClientEndpointInitializer).structure;
        const request = Read({ attributes: [{}], fabricFilter: structure.subscribedFabricFiltered });
        return { site, peer, structure, request };
    }

    function treeOf(peer: Endpoint) {
        const seen = new Array<string>();
        const walk = (endpoint: Endpoint, path: string) => {
            for (const part of endpoint.parts) {
                seen.push(`${path}/ep${part.number}`);
                walk(part, `${path}/ep${part.number}`);
            }
        };
        walk(peer, "");
        return seen;
    }

    const ROOT_PARTS = [
        ZIGBEE_AGGREGATOR,
        ...ZIGBEE_LIGHTS,
        DALI_AGGREGATOR,
        ...DALI_LIGHTS,
        ZWAVE_AGGREGATOR,
        ...ZWAVE_LIGHTS,
    ];

    it("gives each aggregator the endpoints it alone names", async () => {
        const { site, peer, structure, request } = await peerOf();
        await using _site = site;

        await drain(
            structure.mutate(
                request,
                readResult(
                    [descriptorAttr(0, Descriptor.attributes.partsList.id, ROOT_PARTS, 10)],
                    ...nestedBridgeReports(10),
                ),
            ),
        );

        expect(treeOf(peer)).deep.equals(NESTED_BRIDGE_TREE);
    });

    // Three full-family lists name the DALI lights, and which of them owns them cannot be told while
    // the innermost has not said how it composes a list. A claim that cannot be decided has to survive
    // the interaction it arrived in.
    it("places the DALI lights once the nested aggregator says what it is", async () => {
        const { site, peer, structure, request } = await peerOf();
        await using _site = site;

        const reports = nestedBridgeReports(10);
        const dali = reports.findIndex(endpoint => endpoint[0].path.endpointId === DALI_AGGREGATOR);

        await drain(
            structure.mutate(
                request,
                readResult(
                    [descriptorAttr(0, Descriptor.attributes.partsList.id, ROOT_PARTS, 10)],
                    ...reports.filter((_, index) => index !== dali),
                    [descriptorAttr(DALI_AGGREGATOR, Descriptor.attributes.partsList.id, DALI_LIGHTS, 10)],
                ),
            ),
        );

        expect(treeOf(peer), "the DALI lights wait while the nested aggregator has not said what it is").deep.equals(
            NESTED_BRIDGE_TREE.filter(path => !DALI_LIGHTS.some(number => path.endsWith(`/ep${number}`))),
        );

        await drain(structure.mutate(request, readResult(reports[dali])));

        expect(treeOf(peer)).deep.equals(NESTED_BRIDGE_TREE);
    });

    // The innermost of three full-family claimants is only known to be innermost once every endpoint it
    // names has a list of its own — a silent one could still turn out to name an aggregator below it
    it("waits for a silent DALI light before placing any of the bridge", async () => {
        const { site, peer, structure, request } = await peerOf();
        await using _site = site;

        const silent = DALI_LIGHTS[DALI_LIGHTS.length - 1];

        await drain(
            structure.mutate(
                request,
                readResult(
                    [descriptorAttr(0, Descriptor.attributes.partsList.id, ROOT_PARTS, 10)],
                    ...nestedBridgeReports(10).filter(reports => reports[0].path.endpointId !== silent),
                ),
            ),
        );

        expect(treeOf(peer), "no part of the bridge is on the node while one endpoint has said nothing").deep.equals(
            [],
        );

        await drain(
            structure.mutate(
                request,
                readResult(
                    descriptorReports(
                        silent,
                        [
                            { deviceType: BridgedNodeEndpoint.deviceType, revision: 3 },
                            { deviceType: DIMMABLE_LIGHT_DEVICE_TYPE, revision: 3 },
                        ],
                        3,
                        [],
                        10,
                    ),
                ),
            ),
        );

        expect(treeOf(peer)).deep.equals(NESTED_BRIDGE_TREE);
    });

    it("takes the aggregator device type of an endpoint that is also a bridged node", async () => {
        const { site, peer, structure, request } = await peerOf();
        await using _site = site;

        await drain(
            structure.mutate(
                request,
                readResult(
                    [descriptorAttr(0, Descriptor.attributes.partsList.id, ROOT_PARTS, 10)],
                    ...nestedBridgeReports(10),
                ),
            ),
        );

        const dali = peer.parts.get(`ep${ZIGBEE_AGGREGATOR}`)!.parts.get(`ep${DALI_AGGREGATOR}`)!;
        expect(dali.type.deviceType).equals(AggregatorEndpoint.deviceType);
    });

    // An endpoint is installed once and nothing reparents it, so a list that sheds one does not move it.
    // What the peer no longer names anywhere is what goes away.
    it("keeps an endpoint the nested aggregator drops while the peer still names it", async () => {
        const { site, peer, structure, request } = await peerOf();
        await using _site = site;

        await drain(
            structure.mutate(
                request,
                readResult(
                    [descriptorAttr(0, Descriptor.attributes.partsList.id, ROOT_PARTS, 10)],
                    ...nestedBridgeReports(10),
                ),
            ),
        );
        expect(treeOf(peer)).deep.equals(NESTED_BRIDGE_TREE);

        const [dropped, ...kept] = DALI_LIGHTS;
        await drain(
            structure.mutate(
                request,
                readResult([descriptorAttr(DALI_AGGREGATOR, Descriptor.attributes.partsList.id, kept, 11)]),
            ),
        );

        expect(treeOf(peer)).deep.equals(NESTED_BRIDGE_TREE);

        // The peer stops naming it altogether and it goes
        await drain(
            structure.mutate(
                request,
                readResult([
                    descriptorAttr(
                        0,
                        Descriptor.attributes.partsList.id,
                        ROOT_PARTS.filter(number => number !== dropped),
                        12,
                    ),
                    descriptorAttr(
                        ZIGBEE_AGGREGATOR,
                        Descriptor.attributes.partsList.id,
                        [...ZIGBEE_LIGHTS, DALI_AGGREGATOR, ...kept],
                        12,
                    ),
                ]),
            ),
        );

        expect(treeOf(peer)).deep.equals(NESTED_BRIDGE_TREE.filter(path => !path.endsWith(`/ep${dropped}`)));
    });
    // The root's list is what says what the node has, so an endpoint it drops goes even while the
    // aggregators below it still name it
    it("drops an endpoint the root stops naming while the nested aggregator still does", async () => {
        const { site, peer, structure, request } = await peerOf();
        await using _site = site;

        await drain(
            structure.mutate(
                request,
                readResult(
                    [descriptorAttr(0, Descriptor.attributes.partsList.id, ROOT_PARTS, 10)],
                    ...nestedBridgeReports(10),
                ),
            ),
        );
        expect(treeOf(peer)).deep.equals(NESTED_BRIDGE_TREE);

        const dropped = DALI_LIGHTS[0];
        await drain(
            structure.mutate(
                request,
                readResult([
                    descriptorAttr(
                        0,
                        Descriptor.attributes.partsList.id,
                        ROOT_PARTS.filter(number => number !== dropped),
                        11,
                    ),
                ]),
            ),
        );

        expect(treeOf(peer)).deep.equals(NESTED_BRIDGE_TREE.filter(path => !path.endsWith(`/ep${dropped}`)));
    });
});
