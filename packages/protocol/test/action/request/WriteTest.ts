/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Write } from "#action/request/Write.js";
import { MalformedRequestError } from "#action/request/MalformedRequestError.js";
import { AttributeId, ClusterId, EndpointNumber, TlvUInt8, TlvString } from "#types";
import { Seconds } from "#general";

describe("Write", () => {
    describe("basic write requests", () => {
        it("creates write request with numeric IDs", () => {
            const request = Write({
                writes: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            attributeId: AttributeId(0),
                        },
                        data: TlvUInt8.encodeTlv(1),
                    },
                ],
            });

            expect(request.writeRequests).length(1);
            expect(request.writeRequests[0].path.endpointId).equal(1);
            expect(request.writeRequests[0].path.clusterId).equal(6);
            expect(request.writeRequests[0].path.attributeId).equal(0);
        });

        it("creates write request for multiple attributes", () => {
            const request = Write({
                writes: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            attributeId: AttributeId(0),
                        },
                        data: TlvUInt8.encodeTlv(1),
                    },
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(0x28),
                            attributeId: AttributeId(5),
                        },
                        data: TlvString.encodeTlv("test"),
                    },
                ],
            });

            expect(request.writeRequests).length(2);
            expect(request.writeRequests[0].path.attributeId).equal(0);
            expect(request.writeRequests[1].path.attributeId).equal(5);
        });

        it("encodes data with correct schema", () => {
            const testValue = "TestProduct";
            const request = Write({
                writes: [
                    {
                        path: {
                            endpointId: EndpointNumber(0),
                            clusterId: ClusterId(0x28),
                            attributeId: AttributeId(3),
                        },
                        data: TlvString.encodeTlv(testValue),
                    },
                ],
            });

            expect(request.writeRequests).length(1);
            const decoded = TlvString.decodeTlv(request.writeRequests[0].data);
            expect(decoded).equal(testValue);
        });
    });

    describe("timed writes", () => {
        it("creates timed write request", () => {
            const request = Write({
                writes: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            attributeId: AttributeId(0),
                        },
                        data: TlvUInt8.encodeTlv(1),
                    },
                ],
                timed: true,
            });

            expect(request.timedRequest).equal(true);
        });

        it("creates timed write with timeout", () => {
            const request = Write({
                writes: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            attributeId: AttributeId(0),
                        },
                        data: TlvUInt8.encodeTlv(1),
                    },
                ],
                timeout: Seconds(5),
            });

            expect(request.timedRequest).equal(true);
            expect(request.timeout).equal(Seconds(5));
        });

        it("enables timedRequest when timeout is set", () => {
            const request = Write({
                writes: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            attributeId: AttributeId(0),
                        },
                        data: TlvUInt8.encodeTlv(1),
                    },
                ],
                timeout: Seconds(10),
            });

            expect(request.timedRequest).equal(true);
        });

        it("defaults timedRequest to false when not specified", () => {
            const request = Write({
                writes: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            attributeId: AttributeId(0),
                        },
                        data: TlvUInt8.encodeTlv(1),
                    },
                ],
            });

            expect(request.timedRequest).equal(false);
        });
    });

    describe("data versions", () => {
        it("includes data version when provided", () => {
            const request = Write({
                writes: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            attributeId: AttributeId(0),
                        },
                        data: TlvUInt8.encodeTlv(1),
                        dataVersion: 12345,
                    },
                ],
            });

            expect(request.writeRequests[0].dataVersion).equal(12345);
        });

        it("handles writes with different data versions", () => {
            const request = Write({
                writes: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            attributeId: AttributeId(0),
                        },
                        data: TlvUInt8.encodeTlv(1),
                        dataVersion: 100,
                    },
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(8),
                            attributeId: AttributeId(0),
                        },
                        data: TlvUInt8.encodeTlv(2),
                        dataVersion: 200,
                    },
                ],
            });

            expect(request.writeRequests[0].dataVersion).equal(100);
            expect(request.writeRequests[1].dataVersion).equal(200);
        });
    });

    describe("chunked messages", () => {
        it("initializes moreChunkedMessages to false", () => {
            const request = Write({
                writes: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            attributeId: AttributeId(0),
                        },
                        data: TlvUInt8.encodeTlv(1),
                    },
                ],
            });

            expect(request.moreChunkedMessages).equal(false);
        });

        it("supports chunk lists option", () => {
            const request = Write({
                writes: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            attributeId: AttributeId(0),
                        },
                        data: TlvUInt8.encodeTlv(1),
                    },
                ],
                chunkLists: true,
            });

            expect(request.writeRequests).length(1);
        });
    });

    describe("validation", () => {
        it("throws when no writes provided", () => {
            expect(() => {
                Write({ writes: [] });
            }).throws(MalformedRequestError, "contains no attributes to write");
        });

        it("throws when undefined options", () => {
            expect(() => {
                (Write as any)();
            }).throws(MalformedRequestError, "must have options or data");
        });
    });

    describe("interaction model revision", () => {
        it("uses default interaction model revision", () => {
            const request = Write({
                writes: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            attributeId: AttributeId(0),
                        },
                        data: TlvUInt8.encodeTlv(1),
                    },
                ],
            });

            expect(request.interactionModelRevision).not.undefined;
        });

        it("uses custom interaction model revision", () => {
            const request = Write({
                writes: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            attributeId: AttributeId(0),
                        },
                        data: TlvUInt8.encodeTlv(1),
                    },
                ],
                interactionModelRevision: 99,
            });

            expect(request.interactionModelRevision).equal(99);
        });
    });
});
