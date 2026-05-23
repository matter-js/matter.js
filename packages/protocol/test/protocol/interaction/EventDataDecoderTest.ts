/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */
import { normalizeAndDecodeEventData, normalizeEventData } from "#interaction/EventDataDecoder.js";
import {
    ClusterId,
    EndpointNumber,
    EventId,
    EventNumber,
    TlvEventData,
    TlvOfModel,
    TlvVoid,
    TypeFromSchema,
} from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";

const TlvStartUpEvent = TlvOfModel(BasicInformation.events.startUp);

describe("EventDataDecoder", () => {
    describe("normalizeEventData", () => {
        it("normalize data with all paths given for single event entries", () => {
            const data: TypeFromSchema<typeof TlvEventData>[] = [
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(0) },
                    eventNumber: EventNumber(1),
                    priority: 1,
                    epochTimestamp: 0,
                    data: TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
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
                        data: TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
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

        it("preserves wire (EventNumber) order across interleaved event types", () => {
            const data: TypeFromSchema<typeof TlvEventData>[] = [
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(0) },
                    eventNumber: EventNumber(1),
                    priority: 1,
                    epochTimestamp: 0,
                    data: TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
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
                    data: TlvStartUpEvent.encodeTlv({ softwareVersion: 3 }),
                },
            ];

            const normalized = normalizeEventData(data);

            expect(normalized).deep.equal([[data[0]], [data[1]], [data[2]]]);
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
                    data: TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
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

        it("preserves wire (EventNumber) order across interleaved event types", () => {
            const data: TypeFromSchema<typeof TlvEventData>[] = [
                {
                    path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(0) },
                    eventNumber: EventNumber(1),
                    priority: 1,
                    epochTimestamp: 0,
                    systemTimestamp: undefined,
                    deltaEpochTimestamp: undefined,
                    deltaSystemTimestamp: undefined,
                    data: TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
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
                    data: TlvStartUpEvent.encodeTlv({ softwareVersion: 3 }),
                },
            ];

            const normalized = normalizeAndDecodeEventData(data);

            const startUpPath = {
                endpointId: EndpointNumber(0),
                clusterId: ClusterId(0x28),
                eventId: EventId(0),
                nodeId: undefined,
                eventName: "startUp",
            };
            const shutDownPath = {
                endpointId: EndpointNumber(0),
                clusterId: ClusterId(0x28),
                eventId: EventId(1),
                nodeId: undefined,
                eventName: "shutDown",
            };
            const baseOccurrence = {
                priority: 1,
                epochTimestamp: 0,
                systemTimestamp: undefined,
                deltaEpochTimestamp: undefined,
                deltaSystemTimestamp: undefined,
                path: undefined,
            };
            expect(normalized).deep.equal([
                {
                    path: startUpPath,
                    events: [{ ...baseOccurrence, eventNumber: EventNumber(1), data: { softwareVersion: 1 } }],
                },
                {
                    path: shutDownPath,
                    events: [{ ...baseOccurrence, eventNumber: EventNumber(2), data: undefined }],
                },
                {
                    path: startUpPath,
                    events: [{ ...baseOccurrence, eventNumber: EventNumber(3), data: { softwareVersion: 3 } }],
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
                    data: TlvStartUpEvent.encodeTlv({ softwareVersion: 1 }),
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
