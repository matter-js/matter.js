/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeReportPayload,
    chunkAttributePayload,
    compressAttributeDataReportTags,
    encodeAttributePayload,
    encodeEventPayload,
} from "#interaction/AttributeDataEncoder.js";
import { MatterFlowError } from "@matter/general";
import {
    AttributeId,
    ClusterId,
    EndpointNumber,
    EventId,
    EventNumber,
    Priority,
    Status,
    TlvArray,
    TlvClusterId,
    TlvEventReport,
    TlvString,
    TlvUInt8,
} from "@matter/types";

describe("AttributeDataEncoder", () => {
    describe("tag compression for attribute DataReport payloads", () => {
        it("tag compress with dataVersion handling", () => {
            const data: AttributeReportPayload[] = [
                {
                    hasFabricSensitiveData: false,
                    attributeData: {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: ClusterId(0x1d),
                            attributeId: AttributeId(1),
                        },
                        tlv: TlvArray(TlvClusterId),
                        payload: [ClusterId(29), ClusterId(40)],
                        dataVersion: 12345678,
                    },
                },
                {
                    hasFabricSensitiveData: false,
                    attributeData: {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: ClusterId(0x28),
                            attributeId: AttributeId(2),
                        },
                        tlv: TlvUInt8,
                        payload: 1,
                        dataVersion: 12345678,
                    },
                    attributeStatus: undefined,
                },
                {
                    hasFabricSensitiveData: false,
                    attributeData: {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: ClusterId(0x28),
                            attributeId: AttributeId(3),
                        },
                        tlv: TlvString,
                        payload: "product",
                        dataVersion: 12345678,
                    },
                },
                {
                    hasFabricSensitiveData: false,
                    attributeData: {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: ClusterId(0x29),
                            attributeId: AttributeId(4),
                        },
                        tlv: TlvUInt8,
                        payload: 2,
                        dataVersion: 12345678,
                    },
                },
                {
                    hasFabricSensitiveData: false,
                    attributeStatus: {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: ClusterId(0x28),
                            attributeId: AttributeId(400),
                        },
                        status: { status: 134 },
                    },
                },
                {
                    hasFabricSensitiveData: false,
                    attributeStatus: {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: ClusterId(0x99),
                            attributeId: AttributeId(4),
                        },
                        status: { status: 195 },
                    },
                },
                {
                    hasFabricSensitiveData: false,
                    attributeStatus: {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(0x28),
                            attributeId: AttributeId(1),
                        },
                        status: { status: 127 },
                    },
                },
            ];
            const compressedData = compressAttributeDataReportTags(data);

            expect(compressedData).deep.equal([
                {
                    hasFabricSensitiveData: false,
                    attributeData: {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: ClusterId(0x1d),
                            attributeId: AttributeId(1),
                            enableTagCompression: undefined,
                        },
                        tlv: TlvArray(TlvClusterId),
                        payload: [ClusterId(29), ClusterId(40)],
                        dataVersion: 12345678,
                    },
                    attributeStatus: undefined,
                },
                {
                    hasFabricSensitiveData: false,
                    attributeData: {
                        path: {
                            clusterId: ClusterId(0x28),
                            attributeId: AttributeId(2),
                            enableTagCompression: true,
                        },
                        tlv: TlvUInt8,
                        payload: 1,
                        dataVersion: undefined,
                    },
                    attributeStatus: undefined,
                },
                {
                    hasFabricSensitiveData: false,
                    attributeData: {
                        path: {
                            clusterId: ClusterId(0x28),
                            attributeId: AttributeId(3),
                            enableTagCompression: true,
                        },
                        tlv: TlvString,
                        payload: "product",
                        dataVersion: undefined,
                    },
                    attributeStatus: undefined,
                },
                {
                    hasFabricSensitiveData: false,
                    attributeStatus: {
                        path: {
                            clusterId: ClusterId(0x28),
                            attributeId: AttributeId(400),
                            enableTagCompression: true,
                        },
                        status: { status: 134 },
                    },
                    attributeData: undefined,
                },
                {
                    hasFabricSensitiveData: false,
                    attributeData: {
                        path: {
                            clusterId: ClusterId(0x29),
                            attributeId: AttributeId(4),
                            enableTagCompression: true,
                        },
                        tlv: TlvUInt8,
                        payload: 2,
                        dataVersion: undefined,
                    },
                    attributeStatus: undefined,
                },
                {
                    hasFabricSensitiveData: false,
                    attributeStatus: {
                        path: {
                            clusterId: ClusterId(0x99),
                            attributeId: AttributeId(4),
                            enableTagCompression: true,
                        },
                        status: { status: 195 },
                    },
                    attributeData: undefined,
                },
                {
                    hasFabricSensitiveData: false,
                    attributeStatus: {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(0x28),
                            attributeId: AttributeId(1),
                            enableTagCompression: undefined,
                        },
                        status: { status: 127 },
                    },
                    attributeData: undefined,
                },
            ]);
        });
    });

    describe("chunk arrays for DataReports", () => {
        it("chunk array", () => {
            const data: AttributeReportPayload = {
                hasFabricSensitiveData: false,
                attributeData: {
                    path: {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x1d),
                        attributeId: AttributeId(1),
                    },
                    tlv: TlvArray(TlvClusterId),
                    payload: [ClusterId(29), ClusterId(40)],
                    dataVersion: 12345678,
                },
            };
            const chunkedData = chunkAttributePayload(data);

            expect(chunkedData).deep.equal([
                {
                    hasFabricSensitiveData: false,
                    attributeData: {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: ClusterId(0x1d),
                            attributeId: AttributeId(1),
                            listIndex: undefined,
                        },
                        tlv: TlvArray(TlvClusterId),
                        payload: [],
                        dataVersion: 12345678,
                    },
                },
                {
                    hasFabricSensitiveData: false,
                    attributeData: {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: ClusterId(0x1d),
                            attributeId: AttributeId(1),
                            listIndex: null,
                        },
                        tlv: TlvClusterId,
                        payload: ClusterId(29),
                        dataVersion: 12345678,
                    },
                },
                {
                    hasFabricSensitiveData: false,
                    attributeData: {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: ClusterId(0x1d),
                            attributeId: AttributeId(1),
                            listIndex: null,
                        },
                        tlv: TlvClusterId,
                        payload: ClusterId(40),
                        dataVersion: 12345678,
                    },
                },
            ]);
        });
    });

    describe("spec §8.9 encoder field guarantees", () => {
        it("strips isUrgent from EventData paths (§8.9.3.4)", () => {
            const encoded = encodeEventPayload({
                hasFabricSensitiveData: false,
                eventData: {
                    path: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(0x28),
                        eventId: EventId(0),
                        isUrgent: true,
                    },
                    eventNumber: EventNumber(1),
                    priority: Priority.Info,
                    epochTimestamp: 12345,
                    tlv: TlvUInt8,
                    payload: 5,
                },
            });

            const decoded = TlvEventReport.decodeTlv(encoded);
            expect(decoded.eventData?.path.isUrgent).equals(undefined);
        });

        it("rejects an EventReport carrying both data and status (§8.9.3.5)", () => {
            expect(() =>
                encodeEventPayload({
                    hasFabricSensitiveData: false,
                    eventData: {
                        path: { endpointId: EndpointNumber(1), clusterId: ClusterId(0x28), eventId: EventId(0) },
                        eventNumber: EventNumber(1),
                        priority: Priority.Info,
                        epochTimestamp: 12345,
                        tlv: TlvUInt8,
                        payload: 5,
                    },
                    eventStatus: {
                        path: { endpointId: EndpointNumber(1), clusterId: ClusterId(0x28), eventId: EventId(0) },
                        status: { status: Status.Failure },
                    },
                }),
            ).throws(MatterFlowError);
        });

        it("rejects an AttributeReport carrying both data and status (§8.9.2.9)", () => {
            expect(() =>
                encodeAttributePayload({
                    hasFabricSensitiveData: false,
                    attributeData: {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(0x28),
                            attributeId: AttributeId(2),
                        },
                        tlv: TlvUInt8,
                        payload: 1,
                    },
                    attributeStatus: {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(0x28),
                            attributeId: AttributeId(2),
                        },
                        status: { status: Status.Failure },
                    },
                }),
            ).throws(MatterFlowError);
        });

        it("rejects an EventReport carrying neither data nor status (§8.9.3.5)", () => {
            expect(() => encodeEventPayload({ hasFabricSensitiveData: false })).throws(MatterFlowError);
        });

        it("rejects an AttributeReport carrying neither data nor status (§8.9.2.9)", () => {
            expect(() => encodeAttributePayload({ hasFabricSensitiveData: false })).throws(MatterFlowError);
        });
    });
});
