/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    AttributeReportPayload,
    chunkAttributePayload,
    compressAttributeDataReportTags,
} from "#interaction/AttributeDataEncoder.js";
import { AttributeId, ClusterId, EndpointNumber, TlvArray, TlvClusterId, TlvString, TlvUInt8 } from "@matter/types";

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
});
