/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Subscribe } from "#action/request/Subscribe.js";
import { MalformedRequestError } from "#action/request/MalformedRequestError.js";
import { AttributeId, ClusterId, EndpointNumber, EventId } from "#types";
import { Seconds } from "#general";

describe("Subscribe", () => {
    describe("basic subscription", () => {
        it("creates subscription request for attributes", () => {
            const subscribe = Subscribe({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                        attributeId: AttributeId(0),
                    },
                ],
            });

            expect(subscribe.attributeRequests).length(1);
            expect(subscribe.attributeRequests?.[0].endpointId).equal(1);
            expect(subscribe.attributeRequests?.[0].clusterId).equal(6);
            expect(subscribe.attributeRequests?.[0].attributeId).equal(0);
        });

        it("creates subscription request for events", () => {
            const subscribe = Subscribe({
                events: [
                    {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x28),
                        eventId: EventId(0),
                    },
                ],
            });

            expect(subscribe.eventRequests).length(1);
            expect(subscribe.eventRequests?.[0].endpointId).equal(0);
            expect(subscribe.eventRequests?.[0].clusterId).equal(0x28);
        });

        it("creates subscription for both attributes and events", () => {
            const subscribe = Subscribe({
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

            expect(subscribe.attributeRequests).length(1);
            expect(subscribe.eventRequests).length(1);
        });
    });

    describe("keepSubscriptions", () => {
        it("defaults keepSubscriptions to true", () => {
            const subscribe = Subscribe({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                    },
                ],
            });

            expect(subscribe.keepSubscriptions).equal(true);
        });

        it("sets keepSubscriptions to false when specified", () => {
            const subscribe = Subscribe({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                    },
                ],
                keepSubscriptions: false,
            });

            expect(subscribe.keepSubscriptions).equal(false);
        });

        it("sets keepSubscriptions to true explicitly", () => {
            const subscribe = Subscribe({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                    },
                ],
                keepSubscriptions: true,
            });

            expect(subscribe.keepSubscriptions).equal(true);
        });
    });

    describe("subscription intervals", () => {
        it("sets minimum interval floor", () => {
            const subscribe = Subscribe({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                    },
                ],
                minIntervalFloor: Seconds(1),
            });

            expect(subscribe.minIntervalFloor).equal(Seconds(1));
        });

        it("sets maximum interval ceiling", () => {
            const subscribe = Subscribe({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                    },
                ],
                maxIntervalCeiling: Seconds(60),
            });

            expect(subscribe.maxIntervalCeiling).equal(Seconds(60));
        });

        it("sets both min and max intervals", () => {
            const subscribe = Subscribe({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                    },
                ],
                minIntervalFloor: Seconds(1),
                maxIntervalCeiling: Seconds(60),
            });

            expect(subscribe.minIntervalFloor).equal(Seconds(1));
            expect(subscribe.maxIntervalCeiling).equal(Seconds(60));
        });

        it("allows undefined intervals for default behavior", () => {
            const subscribe = Subscribe({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                    },
                ],
            });

            expect(subscribe.minIntervalFloor).undefined;
            expect(subscribe.maxIntervalCeiling).undefined;
        });
    });

    describe("interval validation", () => {
        it("throws on negative minimum interval floor", () => {
            expect(() => {
                Subscribe({
                    attributes: [
                        {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                        },
                    ],
                    minIntervalFloor: Seconds(-1),
                });
            }).throws(MalformedRequestError, "out of range");
        });

        it("throws on negative maximum interval ceiling", () => {
            expect(() => {
                Subscribe({
                    attributes: [
                        {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                        },
                    ],
                    maxIntervalCeiling: Seconds(-1),
                });
            }).throws(MalformedRequestError, "out of range");
        });

        it("throws on minimum interval floor exceeding UINT16_MAX seconds", () => {
            expect(() => {
                Subscribe({
                    attributes: [
                        {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                        },
                    ],
                    minIntervalFloor: Seconds(65536),
                });
            }).throws(MalformedRequestError, "out of range");
        });

        it("throws on maximum interval ceiling exceeding UINT16_MAX seconds", () => {
            expect(() => {
                Subscribe({
                    attributes: [
                        {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                        },
                    ],
                    maxIntervalCeiling: Seconds(65536),
                });
            }).throws(MalformedRequestError, "out of range");
        });
    });

    describe("wildcard subscriptions", () => {
        it("subscribes to all attributes in a cluster", () => {
            const subscribe = Subscribe({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                    },
                ],
            });

            expect(subscribe.attributeRequests?.[0].attributeId).undefined;
        });

        it("subscribes to all events in a cluster", () => {
            const subscribe = Subscribe({
                events: [
                    {
                        endpointId: EndpointNumber(0),
                        clusterId: ClusterId(0x28),
                    },
                ],
            });

            expect(subscribe.eventRequests?.[0].eventId).undefined;
        });

        it("subscribes to all clusters on an endpoint", () => {
            const subscribe = Subscribe({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                    },
                ],
            });

            expect(subscribe.attributeRequests?.[0].clusterId).undefined;
            expect(subscribe.attributeRequests?.[0].attributeId).undefined;
        });
    });

    describe("fabric filtering", () => {
        it("enables fabric filtering by default", () => {
            const subscribe = Subscribe({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                    },
                ],
            });

            expect(subscribe.isFabricFiltered).equal(true);
        });

        it("disables fabric filtering when specified", () => {
            const subscribe = Subscribe({
                attributes: [
                    {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                    },
                ],
                fabricFilter: false,
            });

            expect(subscribe.isFabricFiltered).equal(false);
        });
    });

    describe("data version filters", () => {
        it("includes data version filters", () => {
            const subscribe = Subscribe({
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

            expect(subscribe.dataVersionFilters).length(1);
            expect(subscribe.dataVersionFilters?.[0].dataVersion).equal(12345);
        });
    });

    describe("event filters", () => {
        it("includes event filters", () => {
            const subscribe = Subscribe({
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

            expect(subscribe.eventFilters).length(1);
            expect(subscribe.eventFilters?.[0].eventMin).equal(BigInt(1000));
        });
    });
});
