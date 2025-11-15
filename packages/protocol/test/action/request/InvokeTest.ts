/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Invoke } from "#action/request/Invoke.js";
import { MalformedRequestError } from "#action/request/MalformedRequestError.js";
import { ClusterId, CommandId, EndpointNumber, TlvUInt16, TlvNoArguments } from "#types";
import { Seconds } from "#general";

describe("Invoke", () => {
    describe("basic command invocation", () => {
        it("creates invoke request for single command", () => {
            const request = Invoke({
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    commandId: CommandId(0),
                },
                request: TlvNoArguments.encodeTlv(undefined),
            });

            expect(request.invokeRequests).length(1);
            expect(request.invokeRequests[0].commandPath.endpointId).equal(1);
            expect(request.invokeRequests[0].commandPath.clusterId).equal(6);
            expect(request.invokeRequests[0].commandPath.commandId).equal(0);
        });

        it("creates invoke request with command arguments", () => {
            const identifyTime = 10;
            const request = Invoke({
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(3),
                    commandId: CommandId(0),
                },
                request: TlvUInt16.encodeTlv(identifyTime),
            });

            expect(request.invokeRequests).length(1);
            const decoded = TlvUInt16.decodeTlv(request.invokeRequests[0].commandFields);
            expect(decoded).equal(identifyTime);
        });

        it("creates invoke request for multiple commands with refs", () => {
            const request = Invoke(
                {
                    path: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                        commandId: CommandId(0),
                    },
                    request: TlvNoArguments.encodeTlv(undefined),
                    commandRef: 1,
                },
                {
                    path: {
                        endpointId: EndpointNumber(1),
                        clusterId: ClusterId(6),
                        commandId: CommandId(1),
                    },
                    request: TlvNoArguments.encodeTlv(undefined),
                    commandRef: 2,
                },
            );

            expect(request.invokeRequests).length(2);
            expect(request.invokeRequests[0].commandRef).equal(1);
            expect(request.invokeRequests[1].commandRef).equal(2);
        });
    });

    describe("timed invocations", () => {
        it("creates timed invoke request", () => {
            const request = Invoke({
                commands: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            commandId: CommandId(0),
                        },
                        request: TlvNoArguments.encodeTlv(undefined),
                    },
                ],
                timed: true,
            });

            expect(request.timedRequest).equal(true);
        });

        it("creates invoke request with timeout", () => {
            const request = Invoke({
                commands: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            commandId: CommandId(0),
                        },
                        request: TlvNoArguments.encodeTlv(undefined),
                    },
                ],
                timeout: Seconds(5),
            });

            expect(request.timedRequest).equal(true);
            expect(request.timeout).equal(Seconds(5));
        });

        it("enables timedRequest when timeout is set", () => {
            const request = Invoke({
                commands: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            commandId: CommandId(0),
                        },
                        request: TlvNoArguments.encodeTlv(undefined),
                    },
                ],
                timeout: Seconds(10),
            });

            expect(request.timedRequest).equal(true);
        });
    });

    describe("suppressResponse", () => {
        it("defaults suppressResponse to false", () => {
            const request = Invoke({
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    commandId: CommandId(0),
                },
                request: TlvNoArguments.encodeTlv(undefined),
            });

            expect(request.suppressResponse).equal(false);
        });

        it("enables suppressResponse when specified", () => {
            const request = Invoke({
                commands: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            commandId: CommandId(0),
                        },
                        request: TlvNoArguments.encodeTlv(undefined),
                    },
                ],
                suppressResponse: true,
            });

            expect(request.suppressResponse).equal(true);
        });
    });

    describe("validation", () => {
        it("throws when no commands provided", () => {
            expect(() => {
                Invoke({ commands: [] });
            }).throws(MalformedRequestError, "requires at least one command");
        });

        it("throws when undefined", () => {
            expect(() => {
                (Invoke as any)();
            }).throws(MalformedRequestError, "requires at least one command");
        });

        it("throws when multiple commands without commandRef", () => {
            expect(() => {
                Invoke(
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            commandId: CommandId(0),
                        },
                        request: TlvNoArguments.encodeTlv(undefined),
                    },
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            commandId: CommandId(1),
                        },
                        request: TlvNoArguments.encodeTlv(undefined),
                    },
                );
            }).throws(MalformedRequestError, "CommandRef required");
        });

        it("throws on duplicate commandRef", () => {
            expect(() => {
                Invoke(
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            commandId: CommandId(0),
                        },
                        request: TlvNoArguments.encodeTlv(undefined),
                        commandRef: 1,
                    },
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            commandId: CommandId(1),
                        },
                        request: TlvNoArguments.encodeTlv(undefined),
                        commandRef: 1,
                    },
                );
            }).throws(MalformedRequestError, "Duplicate commandRef");
        });
    });

    describe("interaction model revision", () => {
        it("uses default interaction model revision", () => {
            const request = Invoke({
                path: {
                    endpointId: EndpointNumber(1),
                    clusterId: ClusterId(6),
                    commandId: CommandId(0),
                },
                request: TlvNoArguments.encodeTlv(undefined),
            });

            expect(request.interactionModelRevision).not.undefined;
        });

        it("uses custom interaction model revision", () => {
            const request = Invoke({
                commands: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            commandId: CommandId(0),
                        },
                        request: TlvNoArguments.encodeTlv(undefined),
                    },
                ],
                interactionModelRevision: 99,
            });

            expect(request.interactionModelRevision).equal(99);
        });
    });

    describe("extended options", () => {
        it("supports expectedProcessingTime", () => {
            const request = Invoke({
                commands: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            commandId: CommandId(0),
                        },
                        request: TlvNoArguments.encodeTlv(undefined),
                    },
                ],
                expectedProcessingTime: Seconds(30),
            });

            expect(request.expectedProcessingTime).equal(Seconds(30));
        });

        it("supports useExtendedFailSafeMessageResponseTimeout", () => {
            const request = Invoke({
                commands: [
                    {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(6),
                            commandId: CommandId(0),
                        },
                        request: TlvNoArguments.encodeTlv(undefined),
                    },
                ],
                useExtendedFailSafeMessageResponseTimeout: true,
            });

            expect(request.useExtendedFailSafeMessageResponseTimeout).equal(true);
        });
    });
});
