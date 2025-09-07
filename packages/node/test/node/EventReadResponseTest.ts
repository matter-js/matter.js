/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicInformationCluster } from "#clusters/basic-information";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/index.js";
import { AccessLevel, Specification } from "#model";
import { EventReadResponse, Read, ReadResult } from "#protocol";
import { ClusterId, EndpointNumber, EventId, StatusCode } from "#types";
import { MockServerNode } from "./mock-server-node.js";

const ROOT_ENDPOINT_FULL_CLUSTER_LIST = {
    40: 2,
    51: 1,
};
const ROOT_ENDPOINT_FULL_CLUSTER_LIST_COUNT = Object.values(ROOT_ENDPOINT_FULL_CLUSTER_LIST).reduce(
    (acc, count) => acc + count,
    0,
);

describe("EventReadResponse", () => {
    beforeEach(() => {
        MockTime.reset();
    });

    it("reads concrete event", async () => {
        const response = await readEv(
            await MockServerNode.createOnline(),
            Read.Event({
                cluster: BasicInformationCluster,
                events: "startUp",
            }),
        );

        expect(response.data).deep.equals([
            [
                {
                    kind: "event-value",
                    path: {
                        eventId: 0,
                        clusterId: 40,
                        endpointId: 0,
                    },
                    number: 1n,
                    priority: 2,
                    timestamp: MockTime.epoch.getTime(),
                    tlv: {},
                    value: { softwareVersion: 0 },
                },
            ],
        ]);
        expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
    });

    it("reads concrete event with version filter", async () => {
        const response = await readEvRaw(await MockServerNode.createOnline(), {
            eventRequests: [
                {
                    clusterId: ClusterId(40),
                    eventId: EventId(0),
                },
            ],
            eventFilters: [{ eventMin: 2n }],
        });

        expect(response.data).deep.equals([]);
        expect(response.counts).deep.equals({ status: 0, success: 0, existent: 1 });
    });

    it("reads non-existent concrete endpoint", async () => {
        const response = await readEv(
            await MockServerNode.createOnline(undefined, { device: undefined }),
            Read.Event({
                endpoint: new Endpoint(OnOffLightDevice, { id: "test", number: 1 }),
                cluster: BasicInformationCluster,
                events: "startUp",
            }),
        );

        expect(response.data).deep.equals([
            [
                {
                    kind: "event-status",
                    path: {
                        eventId: 0,
                        clusterId: 40,
                        endpointId: 1,
                    },
                    status: StatusCode.UnsupportedEndpoint,
                },
            ],
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 0 });
    });

    it("reads non-existent concrete event", async () => {
        const node = await MockServerNode.createOnline();
        const response = await readEv(
            node,
            Read.Event({
                endpoint: node,
                cluster: BasicInformationCluster,
                events: "reachableChanged",
            }),
        );

        expect(response.data).deep.equals([
            [
                {
                    kind: "event-status",
                    path: {
                        eventId: 3,
                        clusterId: 40,
                        endpointId: 0,
                    },
                    status: StatusCode.UnsupportedEvent,
                },
            ],
        ]);
        expect(response.counts).deep.equals({ status: 1, success: 0, existent: 0 });
    });

    it("reads wildcard endpoint & events with default events", async () => {
        const node = await MockServerNode.createOnline();
        const response = await readEv(
            node,
            Read.Event({
                endpoint: node,
                cluster: BasicInformationCluster,
            }),
        );

        expect(countEvents(response.data)).deep.equals({
            0: {
                40: 1,
            },
        });
        expect(response.counts).deep.equals({ status: 0, success: 1, existent: 3 });
    });

    it("reads wildcard endpoint & events with extra emitted events", async () => {
        const node = await MockServerNode.createOnline();
        await node.act(agent => node.events.basicInformation.startUp.emit({ softwareVersion: 2 }, agent.context));

        const response = await readEv(
            node,
            Read.Event({
                endpoint: node,
                cluster: BasicInformationCluster,
            }),
        );

        expect(countEvents(response.data)).deep.equals({
            0: {
                40: 2,
            },
        });
        expect(response.counts).deep.equals({ status: 0, success: 2, existent: 3 });
    });

    it("reads full wildcard", async () => {
        const node = await MockServerNode.createOnline();
        await node.act(agent => node.events.basicInformation.startUp.emit({ softwareVersion: 2 }, agent.context));
        const response = await readEv(node, Read.Event({}));
        expect(countEvents(response.data)).deep.equals({
            0: ROOT_ENDPOINT_FULL_CLUSTER_LIST,
        });
        expect(response.counts).deep.equals({
            status: 0,
            success: ROOT_ENDPOINT_FULL_CLUSTER_LIST_COUNT,
            existent: ROOT_ENDPOINT_FULL_CLUSTER_LIST_COUNT + 3,
        });
    });

    // TODO - more tests and Migrate some from InteractionProtocolTest
});

export function readEv(node: MockServerNode, ...args: Parameters<typeof Read>) {
    const request = Read(...args);

    if (!Read.containsEvent(request)) {
        throw new Error("Expected an attribute request");
    }
    return readEvRaw(node, request);
}

export async function readEvRaw(node: MockServerNode, data: Partial<Read.Events>) {
    const request = {
        isFabricFiltered: false,
        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
        ...data,
    } as Read.Attributes;
    if (!Read.containsEvent(request)) {
        throw new Error("Expected an event request");
    }
    return node.online({ accessLevel: AccessLevel.Administer }, async ({ context }) => {
        const response = new EventReadResponse(node.protocol, context);
        const responseChunks = [];
        for await (const chunks of response.process(request)) {
            if (Array.isArray(chunks)) {
                chunks.forEach(chunk => {
                    if ("tlv" in chunk) {
                        chunk.tlv = {};
                    }
                });
            }
            responseChunks.push(chunks);
        }
        return { data: [...responseChunks], counts: response.counts };
    });
}

export function countEvents(chunks: ReadResult.Chunk[]) {
    const counts = {} as Record<EndpointNumber, Record<ClusterId, number>>;
    for (const chunk of chunks) {
        for (const report of chunk) {
            if (report.kind !== "event-value") {
                throw new Error("Only attribute values expected");
            }
            const endpointCounts = (counts[report.path.endpointId] ??= {});
            endpointCounts[report.path.clusterId] ??= 0;
            endpointCounts[report.path.clusterId]++;
        }
    }
    return counts;
}
