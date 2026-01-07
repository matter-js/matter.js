/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { BasicInformation } from "#clusters/basic-information";
import { normalizeAndDecodeEventData, normalizeEventData } from "#interaction/EventDataDecoder.js";
import { ClusterId, EndpointNumber, EventId, EventNumber, TlvEventData, TlvVoid, TypeFromSchema } from "#types";

describe("EventDataDecoder", () => {
    describe("normalizeEventData", () => {
        it("normalize data with all paths given for single event entries", () => {
            const data: TypeFromSchema<typeof TlvEventData>[] = [
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(0) },
                    eventNumber: EventNumber(1),
                    priority: 1,
                    epochTimestamp: 0,
                    data: BasicInformation.TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
                },
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(1) },
                    eventNumber: EventNumber(2),
                    priority: 1,
                    epochTimestamp: 0,
                    data: TlvVoid.encodeTlv(),
                },
            ];

            const normalized = normalizeEventData(data);

            expect(normalized).deep.equal([
                [
                    {
                        path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(0) },
                        eventNumber: EventNumber(1),
                        priority: 1,
                        epochTimestamp: 0,
                        data: BasicInformation.TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
                    },
                ],
                [
                    {
                        path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(1) },
                        eventNumber: EventNumber(2),
                        priority: 1,
                        epochTimestamp: 0,
                        data: TlvVoid.encodeTlv(),
                    },
                ],
            ]);
        });

        it("normalize data with all paths given for multiple events", () => {
            const data: TypeFromSchema<typeof TlvEventData>[] = [
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(0) },
                    eventNumber: EventNumber(1),
                    priority: 1,
                    epochTimestamp: 0,
                    data: BasicInformation.TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
                },
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(1) },
                    eventNumber: EventNumber(2),
                    priority: 1,
                    epochTimestamp: 0,
                    data: TlvVoid.encodeTlv(),
                },
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(0) },
                    eventNumber: EventNumber(3),
                    priority: 1,
                    epochTimestamp: 0,
                    data: BasicInformation.TlvStartUpEvent.encodeTlv({ softwareVersion: 3 }),
                },
            ];

            const normalized = normalizeEventData(data);

            expect(normalized).deep.equal([
                [
                    {
                        path: data[0].path,
                        eventNumber: data[0].eventNumber,
                        priority: data[0].priority,
                        epochTimestamp: data[0].epochTimestamp,
                        data: data[0].data,
                    },
                    {
                        path: data[0].path,
                        eventNumber: data[2].eventNumber,
                        priority: data[2].priority,
                        epochTimestamp: data[2].epochTimestamp,
                        data: data[2].data,
                    },
                ],
                [
                    {
                        path: data[1].path,
                        eventNumber: data[1].eventNumber,
                        priority: data[1].priority,
                        epochTimestamp: data[1].epochTimestamp,
                        data: data[1].data,
                    },
                ],
            ]);
        });
    });

    describe("normalize and Decode EventData", () => {
        it("normalize and decode data with all paths given for single event entries", () => {
            const data: TypeFromSchema<typeof TlvEventData>[] = [
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(0) },
                    eventNumber: EventNumber(1),
                    priority: 1,
                    epochTimestamp: 0,
                    systemTimestamp: undefined,
                    deltaEpochTimestamp: undefined,
                    deltaSystemTimestamp: undefined,
                    data: BasicInformation.TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
                },
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(1) },
                    eventNumber: EventNumber(2),
                    priority: 1,
                    epochTimestamp: 0,
                    systemTimestamp: undefined,
                    deltaEpochTimestamp: undefined,
                    deltaSystemTimestamp: undefined,
                    data: TlvVoid.encodeTlv(),
                },
            ];

            const normalized = normalizeAndDecodeEventData(data);

            expect(normalized).deep.equal([
                {
                    path: {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x28),
                        eventId: EventId(0),
                        nodeId: undefined,
                        eventName: "startUp",
                    },
                    events: [
                        {
                            eventNumber: EventNumber(1),
                            priority: 1,
                            epochTimestamp: 0,
                            systemTimestamp: undefined,
                            deltaEpochTimestamp: undefined,
                            deltaSystemTimestamp: undefined,
                            data: { softwareVersion: 1 },
                            path: undefined,
                        },
                    ],
                },
                {
                    path: {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x28),
                        eventId: EventId(1),
                        nodeId: undefined,
                        eventName: "shutDown",
                    },
                    events: [
                        {
                            eventNumber: EventNumber(2),
                            priority: 1,
                            epochTimestamp: 0,
                            systemTimestamp: undefined,
                            deltaEpochTimestamp: undefined,
                            deltaSystemTimestamp: undefined,
                            data: undefined,
                            path: undefined,
                        },
                    ],
                },
            ]);
        });

        it("normalize and decode data with all paths given for multiple events", () => {
            const data: TypeFromSchema<typeof TlvEventData>[] = [
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(0) },
                    eventNumber: EventNumber(1),
                    priority: 1,
                    epochTimestamp: 0,
                    systemTimestamp: undefined,
                    deltaEpochTimestamp: undefined,
                    deltaSystemTimestamp: undefined,
                    data: BasicInformation.TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
                },
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(1) },
                    eventNumber: EventNumber(2),
                    priority: 1,
                    epochTimestamp: 0,
                    systemTimestamp: undefined,
                    deltaEpochTimestamp: undefined,
                    deltaSystemTimestamp: undefined,
                    data: TlvVoid.encodeTlv(),
                },
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(0) },
                    eventNumber: EventNumber(3),
                    priority: 1,
                    epochTimestamp: 0,
                    systemTimestamp: undefined,
                    deltaEpochTimestamp: undefined,
                    deltaSystemTimestamp: undefined,
                    data: BasicInformation.TlvStartUpEvent.encodeTlv({ softwareVersion: 3 }),
                },
            ];

            const normalized = normalizeAndDecodeEventData(data);

            expect(normalized).deep.equal([
                {
                    path: {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x28),
                        eventId: EventId(0),
                        nodeId: undefined,
                        eventName: "startUp",
                    },
                    events: [
                        {
                            eventNumber: EventNumber(1),
                            priority: 1,
                            epochTimestamp: 0,
                            systemTimestamp: undefined,
                            deltaEpochTimestamp: undefined,
                            deltaSystemTimestamp: undefined,
                            data: { softwareVersion: 1 },
                            path: undefined,
                        },
                        {
                            eventNumber: EventNumber(3),
                            priority: 1,
                            epochTimestamp: 0,
                            systemTimestamp: undefined,
                            deltaEpochTimestamp: undefined,
                            deltaSystemTimestamp: undefined,
                            data: { softwareVersion: 3 },
                            path: undefined,
                        },
                    ],
                },
                {
                    path: {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x28),
                        eventId: EventId(1),
                        nodeId: undefined,
                        eventName: "shutDown",
                    },
                    events: [
                        {
                            eventNumber: EventNumber(2),
                            priority: 1,
                            epochTimestamp: 0,
                            systemTimestamp: undefined,
                            deltaEpochTimestamp: undefined,
                            deltaSystemTimestamp: undefined,
                            data: undefined,
                            path: undefined,
                        },
                    ],
                },
            ]);
        });
    });

    describe("normalize and Decode EventReport for unknown event", () => {
        it("normalize and decode data with all paths given for single event entries", () => {
            const data: TypeFromSchema<typeof TlvEventData>[] = [
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x999), eventId: EventId(0) },
                    eventNumber: EventNumber(1),
                    priority: 1,
                    epochTimestamp: 0,
                    systemTimestamp: undefined,
                    deltaEpochTimestamp: undefined,
                    deltaSystemTimestamp: undefined,
                    data: BasicInformation.TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
                },
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x999), eventId: EventId(1) },
                    eventNumber: EventNumber(2),
                    priority: 1,
                    epochTimestamp: 0,
                    systemTimestamp: undefined,
                    deltaEpochTimestamp: undefined,
                    deltaSystemTimestamp: undefined,
                    data: TlvVoid.encodeTlv(),
                },
            ];

            const normalized = normalizeAndDecodeEventData(data);

            expect(normalized).deep.equal([
                {
                    path: {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x999),
                        eventId: EventId(0),
                        nodeId: undefined,
                        eventName: "Unknown (0x0)",
                    },
                    events: [
                        {
                            eventNumber: EventNumber(1),
                            priority: 1,
                            epochTimestamp: 0,
                            systemTimestamp: undefined,
                            deltaEpochTimestamp: undefined,
                            deltaSystemTimestamp: undefined,
                            data: { "0": 1 },
                            path: undefined,
                        },
                    ],
                },
                {
                    path: {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x999),
                        eventId: EventId(1),
                        nodeId: undefined,
                        eventName: "Unknown (0x1)",
                    },
                    events: [
                        {
                            eventNumber: EventNumber(2),
                            priority: 1,
                            epochTimestamp: 0,
                            systemTimestamp: undefined,
                            deltaEpochTimestamp: undefined,
                            deltaSystemTimestamp: undefined,
                            data: undefined,
                            path: undefined,
                        },
                    ],
                },
            ]);
        });
    });
});
