/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Read } from "#action/request/Read.js";
import { MalformedRequestError } from "#action/request/MalformedRequestError.js";
import { AttributeId, ClusterId, EndpointNumber, EventId } from "#types";

describe("Read", () => {
    describe("attribute requests", () => {
        it("creates read request for single attribute using numeric IDs", () => {
            const request = Read({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                        attributeId: AttributeId(0),
                    },
                ],
            });

            expect(request.attributeRequests).length(1);
            expect(request.attributeRequests?.[0].endpointId).equal(1);
            expect(request.attributeRequests?.[0].clusterId).equal(6);
            expect(request.attributeRequests?.[0].attributeId).equal(0);
        });

        it("creates read request for multiple attributes", () => {
            const request = Read({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                        attributeId: AttributeId(0),
                    },
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                        attributeId: AttributeId(16384),
                    },
                ],
            });

            expect(request.attributeRequests).length(2);
            expect(request.attributeRequests?.[0].attributeId).equal(0);
            expect(request.attributeRequests?.[1].attributeId).equal(16384);
        });

        it("creates cluster-wide attribute read (wildcard)", () => {
            const request = Read({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                    },
                ],
            });

            expect(request.attributeRequests).length(1);
            expect(request.attributeRequests?.[0].endpointId).equal(1);
            expect(request.attributeRequests?.[0].clusterId).equal(6);
            expect(request.attributeRequests?.[0].attributeId).undefined;
        });

        it("creates endpoint-wide wildcard read", () => {
            const request = Read({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                    },
                ],
            });

            expect(request.attributeRequests).length(1);
            expect(request.attributeRequests?.[0].endpointId).equal(1);
            expect(request.attributeRequests?.[0].clusterId).undefined;
            expect(request.attributeRequests?.[0].attributeId).undefined;
        });

        it("creates full wildcard read", () => {
            const request = Read({
                attributes: [{}],
            });

            expect(request.attributeRequests).length(1);
            expect(request.attributeRequests?.[0].endpointId).undefined;
            expect(request.attributeRequests?.[0].clusterId).undefined;
            expect(request.attributeRequests?.[0].attributeId).undefined;
        });
    });

    describe("fabric filtering", () => {
        it("enables fabric filtering by default", () => {
            const request = Read({
                attributes: [
                    {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x28),
                    },
                ],
            });

            expect(request.isFabricFiltered).equal(true);
        });

        it("disables fabric filtering when specified", () => {
            const request = Read({
                attributes: [
                    {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x28),
                    },
                ],
                fabricFilter: false,
            });

            expect(request.isFabricFiltered).equal(false);
        });

        it("enables fabric filtering explicitly", () => {
            const request = Read({
                attributes: [
                    {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x28),
                    },
                ],
                fabricFilter: true,
            });

            expect(request.isFabricFiltered).equal(true);
        });
    });

    describe("data version filters", () => {
        it("includes data version filters when provided", () => {
            const request = Read({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                    },
                ],
                versionFilters: [
                    {
                        path: { endpointId: EndpointNumber(1), clusterId: ClusterId(6) },
                        dataVersion: 12345,
                    },
                ],
            });

            expect(request.dataVersionFilters).length(1);
            expect(request.dataVersionFilters?.[0].dataVersion).equal(12345);
        });

        it("includes multiple data version filters", () => {
            const request = Read({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                    },
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(8),
                    },
                ],
                versionFilters: [
                    {
                        path: { endpointId: EndpointNumber(1), clusterId: ClusterId(6) },
                        dataVersion: 100,
                    },
                    {
                        path: { endpointId: EndpointNumber(1), clusterId: ClusterId(8) },
                        dataVersion: 200,
                    },
                ],
            });

            expect(request.dataVersionFilters).length(2);
            expect(request.dataVersionFilters?.[0].dataVersion).equal(100);
            expect(request.dataVersionFilters?.[1].dataVersion).equal(200);
        });
    });

    describe("event requests", () => {
        it("creates event read request", () => {
            const request = Read({
                events: [
                    {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x28),
                        eventId: EventId(0),
                    },
                ],
            });

            expect(request.eventRequests).length(1);
            expect(request.eventRequests?.[0].endpointId).equal(0);
            expect(request.eventRequests?.[0].clusterId).equal(0x28);
            expect(request.eventRequests?.[0].eventId).equal(0);
        });

        it("creates event wildcard read", () => {
            const request = Read({
                events: [
                    {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x28),
                    },
                ],
            });

            expect(request.eventRequests).length(1);
            expect(request.eventRequests?.[0].eventId).undefined;
        });

        it("includes event filters when provided", () => {
            const request = Read({
                events: [
                    {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x28),
                    },
                ],
                eventFilters: [
                    {
                        eventMin: BigInt(1000),
                    },
                ],
            });

            expect(request.eventFilters).length(1);
            expect(request.eventFilters?.[0].eventMin).equal(BigInt(1000));
        });
    });

    describe("combined requests", () => {
        it("creates request with both attributes and events", () => {
            const request = Read({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                    },
                ],
                events: [
                    {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x28),
                    },
                ],
            });

            expect(request.attributeRequests).length(1);
            expect(request.eventRequests).length(1);
        });

        it("validates request has attributes using containsAttribute", () => {
            const request = Read({
                attributes: [{ endpointId: EndpointNumber(1) }],
            });

            expect(Read.containsAttribute(request)).equal(true);
        });

        it("validates request has events using containsEvent", () => {
            const request = Read({
                events: [{ endpointId: EndpointNumber(0) }],
            });

            expect(Read.containsEvent(request)).equal(true);
        });
    });

    describe("validation", () => {
        it("throws on empty read request", () => {
            expect(() => {
                Read({} as any);
            }).throws(MalformedRequestError, "designates no attributes or events");
        });

        it("throws when no selectors provided with function signature", () => {
            expect(() => {
                (Read as any)();
            }).throws(MalformedRequestError, "designates no attributes or events");
        });
    });

    describe("interaction model revision", () => {
        it("uses default interaction model revision when not specified", () => {
            const request = Read({
                attributes: [{ endpointId: EndpointNumber(1) }],
            });

            expect(request.interactionModelRevision).not.undefined;
        });

        it("uses custom interaction model revision when specified", () => {
            const request = Read({
                attributes: [{ endpointId: EndpointNumber(1) }],
                interactionModelRevision: 99,
            });

            expect(request.interactionModelRevision).equal(99);
        });
    });
});
