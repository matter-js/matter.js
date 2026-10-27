/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { WriteResult } from "#action/response/WriteResult.js";
import { PathError, ReceivedPathError } from "#common/PathError.js";
import { MatterAggregateError } from "@matter/general";
import {
    AttributeId,
    ClusterId,
    EndpointNumber,
    NodeId,
    ReceivedStatusResponseError,
    Status,
    StatusResponseError,
} from "@matter/types";

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

        for (const [name, status, expectedId] of [
            ["a cluster status", Status.ConstraintError, "constraint-error+door-lock"],
            ["a plain Failure with a cluster status", Status.Failure, "door-lock"],
        ] as const) {
            it(`names the cluster in the id of a write rejected with ${name}`, () => {
                const results: WriteResult.AttributeStatus[] = [
                    {
                        kind: "attr-status",
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(0x101),
                            attributeId: AttributeId(0),
                        },
                        status,
                        clusterStatus: 0x02,
                        received: true,
                    },
                ];

                let error: unknown;
                try {
                    WriteResult.assertSuccess(results);
                } catch (e) {
                    error = e;
                }

                expect(error).instanceOf(ReceivedPathError);
                if (!(error instanceof PathError)) {
                    expect.fail(`expected a PathError, got ${error}`);
                }
                expect(error.id).equals(expectedId);
                expect(error.code).equals(status);
                expect(error.clusterCode).equals(0x02);
            });
        }

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

        describe("origin", () => {
            const failed = (clusterId: number, received?: true): WriteResult.AttributeStatus => ({
                kind: "attr-status",
                path: { endpointId: EndpointNumber(1), clusterId: ClusterId(clusterId), attributeId: AttributeId(0) },
                status: Status.ConstraintError,
                clusterStatus: 4,
                received,
            });

            function thrownBy(results: WriteResult.AttributeStatus[]) {
                try {
                    WriteResult.assertSuccess(results);
                } catch (error) {
                    return error;
                }
                expect.fail("assertSuccess did not throw");
            }

            it("throws a received path error for a status the peer sent", () => {
                const error = thrownBy([failed(6, true)]);

                if (!(error instanceof ReceivedPathError)) {
                    expect.fail(`expected a ReceivedPathError, got ${error}`);
                }
                expect(error).instanceOf(PathError);
                expect(error).instanceOf(ReceivedStatusResponseError);
                expect(error).instanceOf(StatusResponseError);
                expect(error.code).equal(Status.ConstraintError);
                expect(error.clusterCode).equal(4);
                expect(error.path.toString()).contains("onOff");
                expect(error.id).equal("constraint-error+on-off");
            });

            it("throws a local path error for a status matter.js produced", () => {
                const error = thrownBy([failed(6)]);

                if (!(error instanceof PathError)) {
                    expect.fail(`expected a PathError, got ${error}`);
                }
                expect(error).not.instanceOf(ReceivedStatusResponseError);
                expect(error.id).equal("constraint-error+on-off");
            });

            it("keeps each failure's origin in an aggregate", () => {
                const error = thrownBy([failed(6, true), failed(8)]);

                if (!(error instanceof MatterAggregateError)) {
                    expect.fail(`expected a MatterAggregateError, got ${error}`);
                }
                const [first, second] = error.errors;
                expect(first).instanceOf(ReceivedPathError);
                expect(second).instanceOf(PathError);
                expect(second).not.instanceOf(ReceivedPathError);
                expect(second).not.instanceOf(ReceivedStatusResponseError);
            });
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
