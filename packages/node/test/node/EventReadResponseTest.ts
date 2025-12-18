/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MessagesServer } from "#behaviors/messages";
import { BasicInformation, BasicInformationCluster } from "#clusters/basic-information";
import { Messages } from "#clusters/messages";
import { OnOffLightDevice } from "#devices/on-off-light";
import { Endpoint } from "#endpoint/index.js";
import { Bytes, Seconds } from "#general";
import { ServerNode } from "#index.js";
import { AccessLevel, Specification } from "#model";
import { EventReadResponse, Read, ReadResult } from "#protocol";
import { ClusterId, EndpointNumber, EventId, EventNumber, FabricIndex, StatusCode } from "#types";
import { MockServerNode } from "./mock-server-node.js";
import { MockSite } from "./mock-site.js";

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

    // Run the same set of simply event reads for fabric scoped and non-fabric-scoped reads
    [true, false].map(fabricScoped =>
        describe(`Read Event ${fabricScoped ? "as fabricScoped" : ""}`, () => {
            it(`reads non-fabric-scoped concrete event with payload`, async () => {
                const response = await readEv(
                    await MockServerNode.createOnline(),
                    fabricScoped,
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
                            timestamp: -1,
                            tlv: {},
                            value: { softwareVersion: 0 },
                        },
                    ],
                ]);
                expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
            });

            // This event has a fabricIndex field in its payload, but is not fabric-sensitive!
            it(`reads non-fabric-scoped concrete event with a payload that has a fabricIndex field`, async () => {
                const node = await MockServerNode.createOnline();
                await node.act(agent =>
                    node.events.basicInformation.leave.emit({ fabricIndex: FabricIndex(4) }, agent.context),
                );

                const response = await readEv(
                    node,
                    fabricScoped,
                    Read.Event({
                        cluster: BasicInformationCluster,
                        events: "leave",
                    }),
                );

                expect(response.data).deep.equals([
                    [
                        {
                            kind: "event-value",
                            path: {
                                eventId: 2,
                                clusterId: 40,
                                endpointId: 0,
                            },
                            number: 3n,
                            priority: 1,
                            timestamp: -1,
                            tlv: {},
                            value: { fabricIndex: FabricIndex(4) },
                        },
                    ],
                ]);
                expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
            });

            it(`reads non-fabric-scoped concrete event without payload`, async () => {
                const node = await MockServerNode.createOnline();
                await node.act(agent => node.events.basicInformation.shutDown.emit(undefined, agent.context));

                const response = await readEv(
                    node,
                    fabricScoped,
                    Read.Event({
                        cluster: BasicInformationCluster,
                        events: "shutDown",
                    }),
                );

                expect(response.data).deep.equals([
                    [
                        {
                            kind: "event-value",
                            path: {
                                eventId: 1,
                                clusterId: 40,
                                endpointId: 0,
                            },
                            number: 3n,
                            priority: 2,
                            timestamp: -1,
                            tlv: {},
                            value: undefined,
                        },
                    ],
                ]);
                expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
            });

            it(`reads fabric-scoped concrete event with payload`, async () => {
                const node = await MockServerNode.createOnline(
                    ServerNode.RootEndpoint.with(MessagesServer.with("ReceivedConfirmation")),
                );
                await node.act(agent =>
                    node.events.messages.messageComplete.emit(
                        {
                            messageId: Bytes.fromHex("0011223344556677889900aabbccddeeff"),
                            futureMessagesPreference: Messages.FutureMessagePreference.Allowed,
                            fabricIndex: FabricIndex(5),
                        },
                        agent.context,
                    ),
                );

                const response = await readEv(
                    node,
                    fabricScoped,
                    Read.Event({
                        cluster: Messages.Cluster,
                        events: "messageComplete",
                    }),
                );

                if (fabricScoped) {
                    expect(response.data).deep.equals([]);
                    expect(response.counts).deep.equals({ status: 0, success: 0, existent: 1 });
                } else {
                    expect(response.data).deep.equals([
                        [
                            {
                                kind: "event-value",
                                path: {
                                    eventId: 2,
                                    clusterId: 0x97,
                                    endpointId: 0,
                                },
                                number: 3n,
                                priority: 1,
                                timestamp: -1,
                                tlv: {},
                                value: {
                                    messageId: Bytes.fromHex("0011223344556677889900aabbccddeeff"),
                                    futureMessagesPreference: Messages.FutureMessagePreference.Allowed,
                                    fabricIndex: FabricIndex(5),
                                },
                            },
                        ],
                    ]);
                    expect(response.counts).deep.equals({ status: 0, success: 1, existent: 1 });
                }
            });
        }),
    );

    it("reads concrete event as fabric scoped", async () => {
        const response = await readEv(
            await MockServerNode.createOnline(),
            true,
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
                    timestamp: -1,
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
            false,
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
            false,
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
            false,
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
            false,
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
        const response = await readEv(node, false, Read.Event({}));
        expect(countEvents(response.data)).deep.equals({
            0: ROOT_ENDPOINT_FULL_CLUSTER_LIST,
        });
        expect(response.counts).deep.equals({
            status: 0,
            success: ROOT_ENDPOINT_FULL_CLUSTER_LIST_COUNT,
            existent: ROOT_ENDPOINT_FULL_CLUSTER_LIST_COUNT + 3,
        });
    });

    describe("On commissioned node", () => {
        before(() => {
            MockTime.init();

            // Required for crypto to succeed
            MockTime.macrotasks = true;
        });

        it("Reads startup event via remote read", async () => {
            await using site = new MockSite();
            // Device is automatically configured with vendorId 0xfff1 and productId 0x8000
            const { controller } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint,
                    groupKeyManagement: {
                        maxGroupKeysPerFabric: 3,
                    },
                },
            });

            // Get the client view of the device (peer)
            const peer1 = controller.peers.get("peer1")!;
            expect(peer1).not.undefined;

            const read = peer1.interaction.read(
                Read(
                    {
                        eventFilters: [{ eventMin: EventNumber(12345) }],
                    },
                    Read.Event({
                        endpoint: EndpointNumber(0),
                        cluster: BasicInformation.Complete,
                        events: ["startUp"],
                    }),
                ),
            );

            let asExpected = false;
            for await (const chunks of read) {
                expect(chunks).deep.equals([]);
                expect(asExpected).equals(false);
                asExpected = true;
            }
            expect(asExpected).equals(true);
        });
    });

    // TODO - more tests and Migrate some from InteractionProtocolTest
});

export function readEv(node: MockServerNode, isFabricFiltered: boolean, ...args: Parameters<typeof Read>) {
    const request = Read(...args);

    if (!Read.containsEvent(request)) {
        throw new Error("Expected an attribute request");
    }
    return readEvRaw(node, {
        ...request,
        isFabricFiltered,
    });
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

            // Normalize the timestamp.  Should be within 2 seconds depending on VM variance
            const epoch = MockTime.epoch.getTime();
            for (const ev of chunks as ReadResult.EventValue[]) {
                if (typeof ev.timestamp === "number" && ev.timestamp - epoch <= Seconds(2)) {
                    ev.timestamp = -1;
                }
            }

            responseChunks.push(chunks as ReadResult.EventValue[]);
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
