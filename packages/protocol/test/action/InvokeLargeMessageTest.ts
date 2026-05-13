/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { inferLargeMessage } from "#action/client/ClientInteraction.js";
import { Invoke } from "#action/request/Invoke.js";
import { CommandModel, Quality } from "@matter/model";
import { ClusterId, CommandId, EndpointNumber, TlvNoArguments } from "@matter/types";
import { OnOffCluster } from "@matter/types/clusters/on-off";
import { WebRtcTransportProvider } from "@matter/types/clusters/web-rtc-transport-provider";

/**
 * Tests for the largeMessage flag on Invoke requests.
 *
 * The largeMessage flag indicates that a command's payload may exceed the IPv6 MTU
 * (1280 bytes) and therefore requires TCP transport.  This flag is set by
 * ClientCommandMethod when the CommandModel has the Large Message quality ("L").
 */
describe("Invoke largeMessage flag", () => {
    describe("CommandModel largeMessage quality", () => {
        it("parses largeMessage from quality DSL string 'L'", () => {
            const quality = new Quality("L");
            expect(quality.largeMessage).to.equal(true);
        });

        it("does not set largeMessage when quality is empty", () => {
            const quality = new Quality({});
            expect(quality.largeMessage).to.be.undefined;
        });

        it("CommandModel with largeMessage quality reports effectiveQuality.largeMessage", () => {
            const model = new CommandModel({
                name: "TestCommand",
                id: 0x01,
                quality: "L",
            });
            expect(model.effectiveQuality.largeMessage).to.equal(true);
        });

        it("CommandModel without largeMessage quality does not report largeMessage", () => {
            const model = new CommandModel({
                name: "TestCommand",
                id: 0x01,
            });
            expect(model.effectiveQuality.largeMessage).to.be.undefined;
        });
    });

    describe("ClientInvoke largeMessage property", () => {
        it("Invoke factory does not set largeMessage by default", () => {
            const invoke = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(1),
                        cluster: OnOffCluster,
                        command: "toggle",
                    }),
                ],
            });

            expect(invoke.largeMessage).to.be.undefined;
        });

        it("largeMessage can be set on an Invoke result", () => {
            const invoke = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(1),
                        cluster: OnOffCluster,
                        command: "toggle",
                    }),
                ],
            });

            // This mirrors what ClientCommandMethod does:
            //   if (largeMessage) { invoke.largeMessage = true; }
            invoke.largeMessage = true;
            expect(invoke.largeMessage).to.equal(true);
        });

        it("largeMessage flag matches the pattern used in ClientCommandMethod", () => {
            // Verify the boolean coercion pattern used in ClientCommandMethod:
            //   const largeMessage = !!commandModel?.effectiveQuality.largeMessage;
            const modelWith = new CommandModel({ name: "Big", id: 0x01, quality: "L" });
            const modelWithout = new CommandModel({ name: "Small", id: 0x02 });

            // With largeMessage quality
            const flagWith = !!modelWith.effectiveQuality.largeMessage;
            expect(flagWith).to.equal(true);

            // Without largeMessage quality
            const flagWithout = !!modelWithout.effectiveQuality.largeMessage;
            expect(flagWithout).to.equal(false);

            // No model at all (undefined case)
            const noModel = undefined as CommandModel | undefined;
            const flagNone = !!noModel?.effectiveQuality.largeMessage;
            expect(flagNone).to.equal(false);
        });
    });

    describe("inferLargeMessage", () => {
        it("detects L quality on a concrete command request", () => {
            const invoke = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(2),
                        cluster: WebRtcTransportProvider,
                        command: "provideOffer",
                        fields: {
                            webRtcSessionId: null,
                            sdp: "v=0",
                            streamUsage: 3,
                            originatingEndpointId: 2,
                        },
                    }),
                ],
            });

            expect(inferLargeMessage(invoke)).to.equal(true);
        });

        it("returns false for a command without L quality", () => {
            const invoke = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(1),
                        cluster: OnOffCluster,
                        command: "toggle",
                    }),
                ],
            });

            expect(inferLargeMessage(invoke)).to.equal(false);
        });

        it("flags the whole invoke when any one command carries L quality", () => {
            const invoke = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(1),
                        cluster: OnOffCluster,
                        command: "toggle",
                        commandRef: 0,
                    }),
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(2),
                        cluster: WebRtcTransportProvider,
                        command: "provideOffer",
                        fields: {
                            webRtcSessionId: null,
                            sdp: "v=0",
                            streamUsage: 3,
                            originatingEndpointId: 2,
                        },
                        commandRef: 1,
                    }),
                ],
            });

            expect(inferLargeMessage(invoke)).to.equal(true);
        });

        it("ignores legacy command requests (no model link)", () => {
            const invoke = Invoke({
                commands: [
                    {
                        endpoint: EndpointNumber(1),
                        cluster: { id: ClusterId(0x1234), name: "Custom" },
                        command: {
                            requestId: CommandId(0x05),
                            requestSchema: TlvNoArguments,
                            responseSchema: TlvNoArguments,
                            timed: false,
                        },
                    },
                ],
            });

            expect(inferLargeMessage(invoke)).to.equal(false);
        });

        it("detects L quality on a wildcard command request", () => {
            const invoke = Invoke({
                commands: [
                    Invoke.WildcardCommandRequest({
                        cluster: WebRtcTransportProvider,
                        command: "provideOffer",
                        fields: {
                            webRtcSessionId: null,
                            sdp: "v=0",
                            streamUsage: 3,
                            originatingEndpointId: 2,
                        },
                    }),
                ],
            });

            expect(inferLargeMessage(invoke)).to.equal(true);
        });

        it("swallows MalformedRequestError when cluster/command unresolved", () => {
            // Build via the factory then replace with an unresolvable specifier — the factory itself
            // rejects unresolvable specifiers up-front, so we bypass it to exercise the catch path.
            const invoke = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(1),
                        cluster: OnOffCluster,
                        command: "toggle",
                    }),
                ],
            });
            invoke.commands.clear();
            invoke.commands.set(0, {
                endpoint: EndpointNumber(1),
                cluster: { id: ClusterId(0x1234), name: "Unknown" },
                command: "nonexistent",
            } as unknown as Invoke.ConcreteCommandRequest);

            expect(inferLargeMessage(invoke)).to.equal(false);
        });

        it("rethrows non-MalformedRequestError raised during model probing", () => {
            const invoke = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(1),
                        cluster: OnOffCluster,
                        command: "toggle",
                    }),
                ],
            });
            invoke.commands.set(0, {
                endpoint: EndpointNumber(1),
                cluster: { id: ClusterId(0x1234), name: "Custom" },
                command: {
                    // Non-legacy (no requestId), non-string — commandOf returns this object as-is,
                    // then the schema access throws an unrelated error which must propagate.
                    get schema(): never {
                        throw new TypeError("simulated bug");
                    },
                },
            } as unknown as Invoke.ConcreteCommandRequest);

            expect(() => inferLargeMessage(invoke)).to.throw(TypeError, "simulated bug");
        });
    });

    describe("ClientInteraction.invoke inference policy", () => {
        // The auto-detect at ClientInteraction.invoke entry is a two-line gate:
        //   if (request.largeMessage === undefined && inferLargeMessage(request)) {
        //       request.largeMessage = true;
        //   }
        // This block pins the precedence so a future "simplification" cannot silently override
        // an explicit caller decision.
        function applyInferencePolicy(request: ReturnType<typeof Invoke>) {
            if (request.largeMessage === undefined && inferLargeMessage(request)) {
                request.largeMessage = true;
            }
        }

        it("preserves an explicit largeMessage:false on a command with L quality", () => {
            const invoke = Invoke({
                commands: [
                    Invoke.ConcreteCommandRequest({
                        endpoint: EndpointNumber(2),
                        cluster: WebRtcTransportProvider,
                        command: "provideOffer",
                        fields: {
                            webRtcSessionId: null,
                            sdp: "v=0",
                            streamUsage: 3,
                            originatingEndpointId: 2,
                        },
                    }),
                ],
            });
            invoke.largeMessage = false;

            applyInferencePolicy(invoke);

            expect(invoke.largeMessage).to.equal(false);
        });
    });

    describe("ClientInteraction.invoke routing decision", () => {
        // Mirror of the routing decision at ClientInteraction.invoke. Pins the contract that L
        // commands skip batching (per spec) but still respect MaxPathsPerInvoke via splitting.
        // Note: ClientInteraction.#invokeSingle does not enforce MaxPathsPerInvoke itself, so a
        // multi-command L invoke routed directly to #invokeSingle would violate the peer limit.
        type Route = "batched" | "split" | "single";
        function decideRoute(request: ReturnType<typeof Invoke>, maxPathsPerInvoke: number): Route {
            if (request.largeMessage === undefined && inferLargeMessage(request)) {
                request.largeMessage = true;
            }
            if (!request.largeMessage) {
                if (request.invokeRequests.length === 1 && request.batchDuration !== false && maxPathsPerInvoke) {
                    const endpointId = request.invokeRequests[0].commandPath.endpointId;
                    if (endpointId !== undefined && endpointId !== 0 && !request.timedRequest) {
                        return "batched";
                    }
                }
            }
            return request.commands.size > maxPathsPerInvoke ? "split" : "single";
        }

        const provideOffer = () =>
            Invoke.ConcreteCommandRequest({
                endpoint: EndpointNumber(2),
                cluster: WebRtcTransportProvider,
                command: "provideOffer",
                fields: {
                    webRtcSessionId: null,
                    sdp: "v=0",
                    streamUsage: 3,
                    originatingEndpointId: 2,
                },
            });

        it("routes a single L command to #invokeSingle", () => {
            const invoke = Invoke({ commands: [provideOffer()] });
            expect(decideRoute(invoke, 1)).to.equal("single");
        });

        it("splits a multi-command L invoke when count exceeds MaxPathsPerInvoke", () => {
            const invoke = Invoke({
                commands: [
                    { ...provideOffer(), commandRef: 0 },
                    { ...provideOffer(), commandRef: 1 },
                ],
            });
            expect(decideRoute(invoke, 1)).to.equal("split");
        });

        it("does not batch L commands even when batchable shape allows it", () => {
            const invoke = Invoke({ commands: [provideOffer()] });
            // Batching kicks in for a single non-timed command at endpoint != 0 with a peer that
            // accepts batches. Verify the L flag suppresses that path.
            expect(decideRoute(invoke, 8)).to.equal("single");
        });
    });
});
