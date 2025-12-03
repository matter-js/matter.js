/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WriteResult } from "#action/response/WriteResult.js";
import { PathError } from "#common/PathError.js";
import { MatterAggregateError } from "#general";
import { Status, AttributeId, ClusterId, EndpointNumber, NodeId } from "#types";

describe("WriteResult", () => {
    describe("AttributeStatus", () => {
        it("creates attribute status with success", () => {
            const status: WriteResult.AttributeStatus = {
                kind: "attr-status",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    attributeId: AttributeId(0),
                },
                status: Status.Success,
            };

            expect(status.kind).equal("attr-status");
            expect(status.status).equal(Status.Success);
        });

        it("creates attribute status with failure", () => {
            const status: WriteResult.AttributeStatus = {
                kind: "attr-status",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    attributeId: AttributeId(0),
                },
                status: Status.UnsupportedAttribute,
            };

            expect(status.status).equal(Status.UnsupportedAttribute);
        });

        it("includes cluster status when present", () => {
            const status: WriteResult.AttributeStatus = {
                kind: "attr-status",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    attributeId: AttributeId(0),
                },
                status: Status.Failure,
                clusterStatus: 0x01,
            };

            expect(status.clusterStatus).equal(0x01);
        });

        it("includes list index when present", () => {
            const status: WriteResult.AttributeStatus = {
                kind: "attr-status",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(0x1f),
                    attributeId: AttributeId(0),
                    listIndex: 2,
                },
                status: Status.Success,
            };

            expect(status.path.listIndex).equal(2);
        });

        it("supports null list index", () => {
            const status: WriteResult.AttributeStatus = {
                kind: "attr-status",
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(0x1f),
                    attributeId: AttributeId(0),
                    listIndex: null,
                },
                status: Status.Success,
            };

            expect(status.path.listIndex).equal(null);
        });
    });

    describe("assertSuccess", () => {
        it("succeeds when all writes succeed", () => {
            const results: WriteResult.AttributeStatus[] = [
                {
                    kind: "attr-status",
                    path: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                        attributeId: AttributeId(0),
                    },
                    status: Status.Success,
                },
                {
                    kind: "attr-status",
                    path: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(8),
                        attributeId: AttributeId(0),
                    },
                    status: Status.Success,
                },
            ];

            expect(() => WriteResult.assertSuccess(results)).not.throws();
        });

        it("throws on single write failure", () => {
            const results: WriteResult.AttributeStatus[] = [
                {
                    kind: "attr-status",
                    path: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                        attributeId: AttributeId(0),
                    },
                    status: Status.UnsupportedAttribute,
                },
            ];

            expect(() => WriteResult.assertSuccess(results)).throws(PathError);
        });

        it("throws MatterAggregateError on multiple failures", () => {
            const results: WriteResult.AttributeStatus[] = [
                {
                    kind: "attr-status",
                    path: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                        attributeId: AttributeId(0),
                    },
                    status: Status.UnsupportedAttribute,
                },
                {
                    kind: "attr-status",
                    path: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(8),
                        attributeId: AttributeId(0),
                    },
                    status: Status.Failure,
                },
            ];

            expect(() => WriteResult.assertSuccess(results)).throws(MatterAggregateError, "Multiple writes failed");
        });

        it("ignores successful writes when some fail", () => {
            const results: WriteResult.AttributeStatus[] = [
                {
                    kind: "attr-status",
                    path: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                        attributeId: AttributeId(0),
                    },
                    status: Status.Success,
                },
                {
                    kind: "attr-status",
                    path: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(8),
                        attributeId: AttributeId(0),
                    },
                    status: Status.UnsupportedAttribute,
                },
                {
                    kind: "attr-status",
                    path: {
                        endpointId: EndpointNumber(2),
                        clusterId: ClusterId(6),
                        attributeId: AttributeId(0),
                    },
                    status: Status.Success,
                },
            ];

            expect(() => WriteResult.assertSuccess(results)).throws(PathError);
        });

        it("succeeds with empty result array", () => {
            const results: WriteResult.AttributeStatus[] = [];

            expect(() => WriteResult.assertSuccess(results)).not.throws();
        });
    });

    describe("path validation", () => {
        it("validates concrete attribute path includes all required fields", () => {
            const path: WriteResult.ConcreteAttributePath = {
                endpointId: EndpointNumber(1),
                clusterId: ClusterId(6),
                attributeId: AttributeId(0),
            };

            expect(path.endpointId).not.undefined;
            expect(path.clusterId).not.undefined;
            expect(path.attributeId).not.undefined;
        });

        it("supports optional nodeId in path", () => {
            const path: WriteResult.ConcreteAttributePath = {
                nodeId: NodeId(123n),
                endpointId: EndpointNumber(1),
                clusterId: ClusterId(6),
                attributeId: AttributeId(0),
            };

            expect(path.nodeId).equal(BigInt(123));
        });
    });
});
