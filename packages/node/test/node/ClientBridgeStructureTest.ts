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
        // Descriptor arrives — the shape that used to keep the sentinel forever.
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
