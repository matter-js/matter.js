/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReadResult } from "#action/response/ReadResult.js";
import { AttributeId, ClusterId, EndpointNumber, StatusCode, TlvUInt8, TlvString, Priority, EventId, EventNumber, Status } from "#types";

describe("ReadResult", () => {
    describe("AttributeValue", () => {
        it("creates attribute value structure", () => {
            const attributeValue: ReadResult.AttributeValue = {
                kind: "attr-value",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    attributeId: AttributeId(0),
                },
                value: true,
                version: 12345,
                tlv: TlvUInt8,
            };

            expect(attributeValue.kind).equal("attr-value");
            expect(attributeValue.path.endpointId).equal(1);
            expect(attributeValue.path.clusterId).equal(6);
            expect(attributeValue.path.attributeId).equal(0);
            expect(attributeValue.value).equal(true);
            expect(attributeValue.version).equal(12345);
        });

        it("stores string values", () => {
            const attributeValue: ReadResult.AttributeValue = {
                kind: "attr-value",
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x28),
                    attributeId: AttributeId(3),
                },
                value: "TestProduct",
                version: 1,
                tlv: TlvString,
            };

            expect(attributeValue.value).equal("TestProduct");
        });

        it("stores numeric values", () => {
            const attributeValue: ReadResult.AttributeValue = {
                kind: "attr-value",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    attributeId: AttributeId(0),
                },
                value: 42,
                version: 100,
                tlv: TlvUInt8,
            };

            expect(attributeValue.value).equal(42);
        });
    });

    describe("AttributeStatus", () => {
        it("creates attribute status structure with success", () => {
            const attributeStatus: ReadResult.AttributeStatus = {
                kind: "attr-status",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    attributeId: AttributeId(0),
                },
                status: StatusCode.Success,
            };

            expect(attributeStatus.kind).equal("attr-status");
            expect(attributeStatus.status).equal(StatusCode.Success);
        });

        it("creates attribute status with error code", () => {
            const attributeStatus: ReadResult.AttributeStatus = {
                kind: "attr-status",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    attributeId: AttributeId(999),
                },
                status: StatusCode.UnsupportedAttribute,
            };

            expect(attributeStatus.status).equal(StatusCode.UnsupportedAttribute);
        });

        it("includes cluster status when present", () => {
            const attributeStatus: ReadResult.AttributeStatus = {
                kind: "attr-status",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    attributeId: AttributeId(0),
                },
                status: StatusCode.Failure,
                clusterStatus: 0x01,
            };

            expect(attributeStatus.clusterStatus).equal(0x01);
        });
    });

    describe("EventValue", () => {
        it("creates event value structure", () => {
            const eventValue: ReadResult.EventValue = {
                kind: "event-value",
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x28),
                    eventId: EventId(0),
                },
                number: EventNumber(1000n),
                timestamp: 1234567890,
                priority: Priority.Info,
                value: { softwareVersion: 1 },
                tlv: TlvUInt8,
            };

            expect(eventValue.kind).equal("event-value");
            expect(eventValue.path.endpointId).equal(0);
            expect(eventValue.number).equal(BigInt(1000));
            expect(eventValue.timestamp).equal(1234567890);
            expect(eventValue.priority).equal(Priority.Info);
        });

        it("stores event data", () => {
            const eventData = { softwareVersion: 2, timestamp: Date.now() };
            const eventValue: ReadResult.EventValue = {
                kind: "event-value",
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x28),
                    eventId: EventId(1),
                },
                number: EventNumber(2000n),
                timestamp: 1234567890,
                priority: Priority.Critical,
                value: eventData,
                tlv: TlvUInt8,
            };

            expect(eventValue.value).deep.equal(eventData);
            expect(eventValue.priority).equal(Priority.Critical);
        });
    });

    describe("EventStatus", () => {
        it("creates event status structure", () => {
            const eventStatus: ReadResult.EventStatus = {
                kind: "event-status",
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x28),
                    eventId: EventId(0),
                },
                status: StatusCode.Success,
            };

            expect(eventStatus.kind).equal("event-status");
            expect(eventStatus.status).equal(StatusCode.Success);
        });

        it("includes cluster status for events", () => {
            const eventStatus: ReadResult.EventStatus = {
                kind: "event-status",
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x28),
                    eventId: EventId(1),
                },
                status: StatusCode.Failure,
                clusterStatus: 0x02,
            };

            expect(eventStatus.clusterStatus).equal(0x02);
        });
    });

    describe("Report types", () => {
        it("supports attribute value reports", () => {
            const report: ReadResult.Report = {
                kind: "attr-value",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    attributeId: AttributeId(0),
                },
                value: true,
                version: 1,
                tlv: TlvUInt8,
            };

            expect(report.kind).equal("attr-value");
        });

        it("supports attribute status reports", () => {
            const report: ReadResult.Report = {
                kind: "attr-status",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    attributeId: AttributeId(0),
                },
                status: StatusCode.Success,
            };

            expect(report.kind).equal("attr-status");
        });

        it("supports event value reports", () => {
            const report: ReadResult.Report = {
                kind: "event-value",
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x28),
                    eventId: EventId(0),
                },
                number: EventNumber(1000n),
                timestamp: 1234567890,
                priority: Priority.Info,
                value: {},
                tlv: TlvUInt8,
            };

            expect(report.kind).equal("event-value");
        });

        it("supports event status reports", () => {
            const report: ReadResult.Report = {
                kind: "event-status",
                path: {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x28),
                    eventId: EventId(0),
                },
                status: StatusCode.Success,
            };

            expect(report.kind).equal("event-status");
        });
    });
});
