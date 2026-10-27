/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OnOffClient, OnOffServer } from "#behaviors/on-off";
import { ServerNode } from "#node/ServerNode.js";
import {
    AbortedError,
    ClosedError,
    createPromise,
    InternalError,
    MockNetwork,
    Network,
    Duration,
    Minutes,
    Seconds,
    ServerAddressIp,
    ServerAddressUdp,
    Time,
} from "@matter/general";
import { MockSite } from "@matter/node/testing";
import {
    ClientInteraction,
    ClientInvoke,
    ExchangeManager,
    Invoke,
    MessageChannel,
    MessageExchange,
    MessageType,
    NetworkProfiles,
    PeerSet,
    SessionParameters,
} from "@matter/protocol";
import { EndpointNumber, TlvInvokeRequest } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";

interface InvokeExchange {
    commandCount: number;
    timedRequest?: boolean;
    suppressResponse?: boolean;
    precededByTimedRequest: boolean;
    network?: string;
    addressOverride?: ServerAddressUdp;
    peerAddress?: ServerAddressIp;
    expectedProcessingTime?: Duration;
    additionalDelay?: Duration;
    timeout?: Duration;
}

/**
 * Record every exchange that sends an InvokeRequest, in send order: how many commands it carries, its network,
 * the address override it sends with and the response timeout it waits with.
 *
 * {@link delayFirstSend} holds back the first InvokeRequest by that much virtual time.
 */
async function captureInvokeExchanges(run: () => Promise<unknown>, delayFirstSend?: Duration) {
    const records = new Array<InvokeExchange>();
    const byExchange = new WeakMap<MessageExchange, InvokeExchange>();
    const networkOf = new WeakMap<MessageExchange, string | undefined>();
    const timedExchanges = new WeakSet<MessageExchange>();
    let waiting: InvokeExchange | undefined;

    const { initiateExchangeForSession } = ExchangeManager.prototype;
    const { send, nextMessage } = MessageExchange.prototype;
    const channelSend = MessageChannel.prototype.send;
    const { calculateMaximumPeerResponseTime } = MessageChannel.prototype;

    ExchangeManager.prototype.initiateExchangeForSession = function (session, protocolId, options) {
        const exchange = initiateExchangeForSession.call(this, session, protocolId, options);
        networkOf.set(exchange, options?.network?.id);
        return exchange;
    };
    MessageExchange.prototype.send = async function (messageType, payload, options) {
        if (messageType === MessageType.TimedRequest) {
            timedExchanges.add(this);
        }
        if (messageType === MessageType.InvokeRequest && !byExchange.has(this)) {
            const { invokeRequests, timedRequest, suppressResponse } = TlvInvokeRequest.decode(payload);
            const record = {
                commandCount: invokeRequests.length,
                timedRequest,
                suppressResponse,
                precededByTimedRequest: timedExchanges.has(this),
                network: networkOf.get(this),
            };
            byExchange.set(this, record);
            records.push(record);
            if (records.length === 1 && delayFirstSend !== undefined) {
                await Time.sleep("held invoke", delayFirstSend);
            }
        }
        return send.call(this, messageType, payload, options);
    };
    MessageChannel.prototype.send = function (message, options) {
        const record = options?.exchange && byExchange.get(options.exchange);
        if (record && message.payloadHeader.messageType === MessageType.InvokeRequest) {
            record.addressOverride = options?.addressOverride;
            record.peerAddress = this.networkAddress;
        }
        return channelSend.call(this, message, options);
    };
    MessageExchange.prototype.nextMessage = function (options) {
        const record = byExchange.get(this);
        if (record === undefined || record.timeout !== undefined) {
            return nextMessage.call(this, options);
        }
        // The timeout is computed synchronously before the first await of nextMessage
        waiting = record;
        try {
            return nextMessage.call(this, options);
        } finally {
            waiting = undefined;
        }
    };
    MessageChannel.prototype.calculateMaximumPeerResponseTime = function (...args) {
        const timeout = calculateMaximumPeerResponseTime.apply(this, args);
        if (waiting) {
            waiting.expectedProcessingTime = args[2];
            waiting.additionalDelay = args[4];
            waiting.timeout = timeout;
        }
        return timeout;
    };

    try {
        await MockTime.resolve(run());
    } finally {
        ExchangeManager.prototype.initiateExchangeForSession = initiateExchangeForSession;
        MessageExchange.prototype.send = send;
        MessageExchange.prototype.nextMessage = nextMessage;
        MessageChannel.prototype.send = channelSend;
        MessageChannel.prototype.calculateMaximumPeerResponseTime = calculateMaximumPeerResponseTime;
    }

    return records;
}

async function batchingPair(site: MockSite) {
    const { controller, device } = await site.addCommissionedPair({
        device: {
            type: ServerNode.RootEndpoint,
            basicInformation: { maxPathsPerInvoke: 10 },
        },
    });
    return { controller, peer1: controller.peers.get("peer1")!, device };
}

function onOffInvoke(command: "on" | "off" | "toggle", options: Partial<ClientInvoke> = {}): ClientInvoke {
    return {
        ...Invoke({
            commands: [Invoke.ConcreteCommandRequest({ endpoint: EndpointNumber(1), cluster: OnOff, command })],
        }),
        ...options,
    };
}

async function drain(results: AsyncIterable<unknown>) {
    for await (const _chunk of results);
}

describe("ClientInvoke", () => {
    before(() => {
        MockTime.init();
    });

    it("executes commands via the batcher", async () => {
        await using site = new MockSite();
        // Enable batching with maxPathsPerInvoke=10
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // Get initial state
        const initialState = device.parts.get(1)!.stateOf(OnOffServer).onOff;

        // Execute a command via the batcher
        await MockTime.resolve(cmds.toggle());

        // State should be toggled
        const finalState = device.parts.get(1)!.stateOf(OnOffServer).onOff;
        expect(finalState).equals(!initialState);
    });

    it("requires MockTime.resolve for batched commands (non-root endpoints)", async () => {
        await using site = new MockSite();
        // Enable batching with maxPathsPerInvoke=10
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        // Commands to non-root endpoints require batching
        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // Start a command but don't resolve the timer yet
        const pendingPromise = cmds.toggle();

        // The command should be pending in the batcher
        let resolved = false;
        // oxlint-disable-next-line @typescript-eslint/no-floating-promises
        pendingPromise.then(() => (resolved = true));

        // Give microtasks a chance to run
        await Promise.resolve();
        expect(resolved).equals(false);

        // Now resolve with MockTime
        await MockTime.resolve(pendingPromise);
        expect(resolved).equals(true);
    });

    it("bypasses batching when maxPathsPerInvoke is 1", async () => {
        await using site = new MockSite();
        // Default device has maxPathsPerInvoke=1 (no batching)
        const { controller } = await site.addCommissionedPair();

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // With maxPathsPerInvoke=1, commands bypass batching but still need MockTime
        // for the underlying async operations
        await MockTime.resolve(cmds.toggle());
    });

    it("clears maxPathsPerInvoke cache when node goes offline", async () => {
        await using site = new MockSite();
        // Enable batching with maxPathsPerInvoke=10
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // First command - should use batching (maxPathsPerInvoke=10)
        await MockTime.resolve(cmds.toggle());

        // Take the device offline
        await MockTime.resolve(device.stop());

        // Bring it back online with different maxPathsPerInvoke
        await device.act(agent => {
            agent.basicInformation.state.maxPathsPerInvoke = 1;
        });
        await MockTime.resolve(device.start());

        // The peer should have reconnected and the cache should be cleared
        // Next command should see the new maxPathsPerInvoke=1
        await MockTime.resolve(cmds.toggle(undefined, { connectionTimeout: Minutes(5) }));
        expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(false);
    });

    it("executes multiple commands sequentially", async () => {
        await using site = new MockSite();
        // Enable batching with maxPathsPerInvoke=10
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // Execute commands sequentially
        await MockTime.resolve(cmds.off());
        expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(false);

        await MockTime.resolve(cmds.on());
        expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(true);

        await MockTime.resolve(cmds.toggle());
        expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(false);
    });

    it("rejects pending commands when batcher is closed", async () => {
        await using site = new MockSite();
        // Enable batching with maxPathsPerInvoke=10
        const { controller } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // Queue some commands and immediately attach rejection handlers to avoid unhandled rejection
        const promise1 = cmds.toggle().catch(e => e);
        const promise2 = cmds.toggle().catch(e => e);

        // Close the ClientInteraction directly - this should reject pending commands
        await (peer1.interaction as ClientInteraction).close();

        // Both promises should have resolved to errors
        const error1 = await MockTime.resolve(promise1);
        const error2 = await MockTime.resolve(promise2);

        expect(error1).instanceOf(ClosedError);
        expect(error2).instanceOf(ClosedError);
    });

    it("bypasses batching for timed invoke requests", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        // Create a timed invoke request for a non-root endpoint command
        const request = Invoke({
            commands: [
                Invoke.ConcreteCommandRequest({
                    endpoint: EndpointNumber(1),
                    cluster: OnOff,
                    command: "toggle",
                }),
            ],
            timed: true,
        });

        // Timed commands bypass batching and execute directly via #invokeSingle
        const exchanges = await captureInvokeExchanges(() => drain(peer1.interaction.invoke(request)));
        expect(exchanges.length).equals(1);
        expect(exchanges[0].precededByTimedRequest).true;

        const finalState = device.parts.get(1)!.stateOf(OnOffServer).onOff;
        expect(finalState).equals(true);
    });

    it("batches different commands together while splitting duplicates", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // Initial state is false
        expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(false);

        // Fire: on, toggle, on in same tick
        // "on" and "toggle" have different paths — can batch together
        // second "on" duplicates the first — must go to a separate batch
        // Batch 1: [on, toggle] → state becomes true, then false
        // Batch 2: [on] → state becomes true
        const p1 = cmds.on();
        const p2 = cmds.toggle();
        const p3 = cmds.on();

        await MockTime.resolve(Promise.all([p1, p2, p3]));

        // Final state should be true (on → toggle off → on again)
        expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(true);
    });

    describe("network propagation", () => {
        /**
         * Spy on NetworkProfiles.select for the given controller and capture each network id argument.
         * Returns the captured ids and a restore function.
         */
        function spyNetworkSelect(controller: ServerNode) {
            const profiles = controller.env.get(NetworkProfiles);
            const captured: Array<string | undefined> = [];
            const original = profiles.select.bind(profiles);
            (profiles as any).select = (peer: any, id?: string) => {
                captured.push(id);
                return original(peer, id);
            };
            return {
                captured,
                restore: () => {
                    (profiles as any).select = original;
                },
            };
        }

        it("direct invoke (#invokeSingle) propagates network to exchange", async () => {
            // batchDuration: false bypasses the batching path so ClientInteraction.invoke() calls #invokeSingle directly
            await using site = new MockSite();
            const { controller } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint,
                    basicInformation: { maxPathsPerInvoke: 10 },
                },
            });

            const peer1 = controller.peers.get("peer1")!;
            const { captured, restore } = spyNetworkSelect(controller);

            try {
                // Two concurrent invokes on different paths prove the direct path: batched they would share one
                // exchange
                const exchanges = await captureInvokeExchanges(() =>
                    Promise.all([
                        drain(peer1.interaction.invoke(onOffInvoke("on", { batchDuration: false }))),
                        drain(peer1.interaction.invoke(onOffInvoke("toggle", { batchDuration: false }))),
                    ]),
                );
                expect(exchanges.map(({ commandCount }) => commandCount)).deep.equals([1, 1]);
            } finally {
                restore();
            }

            expect(captured).to.include("unlimited");
        });

        it("batched invoke (#invokeWithBatching) propagates network to exchange", async () => {
            // maxPathsPerInvoke=10 + single non-root non-timed command → goes through #invokeWithBatching
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint,
                    basicInformation: { maxPathsPerInvoke: 10 },
                },
            });

            const peer1 = controller.peers.get("peer1")!;
            const ep1 = peer1.endpoints.for(1);
            const cmds = ep1.commandsOf(OnOffClient);
            const { captured, restore } = spyNetworkSelect(controller);

            try {
                const exchanges = await captureInvokeExchanges(() => Promise.all([cmds.on(), cmds.toggle()]));
                expect(exchanges.map(({ commandCount }) => commandCount)).deep.equals([2]);
            } finally {
                restore();
            }

            expect(captured).to.include("unlimited");
            expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(false);
        });

        it("split invoke (#invokeWithSplitting) propagates network to each exchange", async () => {
            // 2 commands + maxPathsPerInvoke=1 → goes through #invokeWithSplitting (2 exchanges)
            await using site = new MockSite();
            const { controller, device } = await site.addCommissionedPair({
                device: {
                    type: ServerNode.RootEndpoint,
                    basicInformation: { maxPathsPerInvoke: 1 },
                },
            });

            const peer1 = controller.peers.get("peer1")!;
            const { captured, restore } = spyNetworkSelect(controller);

            try {
                // Two distinct commands in a single invoke request; maxPathsPerInvoke=1 forces splitting.
                // commandRef is required when invoking multiple commands in one request.
                const request = Invoke({
                    commands: [
                        Invoke.ConcreteCommandRequest({
                            endpoint: EndpointNumber(1),
                            cluster: OnOff,
                            command: "on",
                            commandRef: 1,
                        }),
                        Invoke.ConcreteCommandRequest({
                            endpoint: EndpointNumber(1),
                            cluster: OnOff,
                            command: "off",
                            commandRef: 2,
                        }),
                    ],
                });

                await MockTime.resolve(
                    (async () => {
                        for await (const _chunk of peer1.interaction.invoke(request));
                    })(),
                );
            } finally {
                restore();
            }

            // Both split exchanges must use the unlimited network
            expect(captured.length).to.be.at.least(2);
            expect(captured.every(id => id === "unlimited")).to.be.true;
            expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(false);
        });
    });

    describe("per-request options", () => {
        const sendDirect: [field: keyof ClientInvoke, options: Partial<ClientInvoke>][] = [
            ["expectedProcessingTime", { expectedProcessingTime: Seconds(90) }],
            ["useExtendedFailSafeMessageResponseTimeout", { useExtendedFailSafeMessageResponseTimeout: true }],
            ["additionalMrpDelay", { additionalMrpDelay: Seconds(3) }],
            [
                "interactionModelRevision",
                { interactionModelRevision: SessionParameters.fallbacks.interactionModelRevision - 1 },
            ],
            ["timeout", { timeout: Seconds(5) }],
            ["beforeDispatch", { beforeDispatch: () => undefined }],
            ["timedRequest", { timedRequest: true }],
            ["suppressResponse", { suppressResponse: true }],
            ["delayReportData", { delayReportData: { delayMinMs: 0, delayJitterWindowMs: 0 } }],
            ["largeMessage", { largeMessage: true }],
        ];

        for (const [field, options] of sendDirect) {
            it(`command with ${field} never joins a batch`, async () => {
                await using site = new MockSite();
                const { peer1 } = await batchingPair(site);

                // Some of these the peer or transport may refuse; only how the commands were grouped matters here
                const exchanges = await captureInvokeExchanges(() =>
                    Promise.allSettled([
                        drain(peer1.interaction.invoke(onOffInvoke("on"))),
                        drain(peer1.interaction.invoke(onOffInvoke("toggle", options))),
                    ]),
                );

                expect(exchanges.length).at.least(1);
                expect(exchanges.map(({ commandCount }) => commandCount)).not.include(2);
            });
        }

        it("timed command goes out alone after a TimedRequest", async () => {
            await using site = new MockSite();
            const { peer1 } = await batchingPair(site);

            const exchanges = await captureInvokeExchanges(() =>
                Promise.all([
                    drain(peer1.interaction.invoke(onOffInvoke("on"))),
                    drain(peer1.interaction.invoke(onOffInvoke("toggle", { timedRequest: true }))),
                ]),
            );

            const timed = exchanges.filter(({ timedRequest }) => timedRequest);
            expect(timed.length).equals(1);
            expect(timed[0].commandCount).equals(1);
            expect(timed[0].precededByTimedRequest).true;
            expect(exchanges.map(({ commandCount }) => commandCount)).deep.equals([1, 1]);
        });

        it("command with suppressResponse goes out alone", async () => {
            await using site = new MockSite();
            const { peer1 } = await batchingPair(site);

            const exchanges = await captureInvokeExchanges(() =>
                Promise.all([
                    drain(peer1.interaction.invoke(onOffInvoke("on"))),
                    drain(peer1.interaction.invoke(onOffInvoke("toggle", { suppressResponse: true }))),
                ]),
            );

            const suppressed = exchanges.filter(({ suppressResponse }) => suppressResponse);
            expect(suppressed.length).equals(1);
            expect(suppressed[0].commandCount).equals(1);
        });

        it("only a non-default interaction model revision keeps a command out of the batch", async () => {
            await using site = new MockSite();
            const { peer1 } = await batchingPair(site);
            const { interactionModelRevision } = SessionParameters.fallbacks;

            const exchanges = await captureInvokeExchanges(() =>
                Promise.allSettled([
                    drain(peer1.interaction.invoke(onOffInvoke("on", { interactionModelRevision }))),
                    drain(peer1.interaction.invoke(onOffInvoke("toggle", { interactionModelRevision }))),
                    drain(
                        peer1.interaction.invoke(
                            onOffInvoke("off", { interactionModelRevision: interactionModelRevision - 1 }),
                        ),
                    ),
                ]),
            );

            expect(exchanges.map(({ commandCount }) => commandCount).sort()).deep.equals([1, 2]);
        });

        it("command without an endpoint never joins a batch", async () => {
            await using site = new MockSite();
            const { peer1 } = await batchingPair(site);

            const wildcard = Invoke({
                commands: [Invoke.WildcardCommandRequest({ cluster: OnOff, command: "toggle" })],
            });

            // The peer refuses a wildcard invoke; only how the commands were grouped matters here
            const exchanges = await captureInvokeExchanges(() =>
                Promise.allSettled([
                    drain(peer1.interaction.invoke(onOffInvoke("on"))),
                    drain(peer1.interaction.invoke(wildcard)),
                ]),
            );

            expect(exchanges.length).at.least(1);
            expect(exchanges.map(({ commandCount }) => commandCount)).not.include(2);
        });

        it("abort, network, skipValidation and icdAwaitTimeout do not keep a command out of the batch", async () => {
            await using site = new MockSite();
            const { peer1 } = await batchingPair(site);

            const options: Partial<ClientInvoke> = {
                abort: new AbortController().signal,
                network: "unlimited",
                skipValidation: true,
                icdAwaitTimeout: Seconds(5),
            };
            const exchanges = await captureInvokeExchanges(() =>
                Promise.all([
                    drain(peer1.interaction.invoke(onOffInvoke("on", options))),
                    drain(peer1.interaction.invoke(onOffInvoke("toggle", options))),
                ]),
            );

            expect(exchanges.map(({ commandCount }) => commandCount)).deep.equals([2]);
        });

        it("command with its own expected processing time keeps it", async () => {
            await using site = new MockSite();
            const { peer1, device } = await batchingPair(site);

            const exchanges = await captureInvokeExchanges(() =>
                drain(peer1.interaction.invoke(onOffInvoke("on", { expectedProcessingTime: Seconds(90) }))),
            );

            expect(exchanges.length).equals(1);
            expect(exchanges[0].expectedProcessingTime).equals(Seconds(90));
            expect(exchanges[0].timeout).greaterThan(Seconds(90));
            expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(true);
        });

        it("command with the extended fail-safe timeout keeps it", async () => {
            await using site = new MockSite();
            const { peer1 } = await batchingPair(site);

            const exchanges = await captureInvokeExchanges(() =>
                drain(peer1.interaction.invoke(onOffInvoke("on", { useExtendedFailSafeMessageResponseTimeout: true }))),
            );

            expect(exchanges.length).equals(1);
            expect(exchanges[0].expectedProcessingTime).equals(Seconds(30));
        });

        it("command with its own MRP delay keeps it", async () => {
            await using site = new MockSite();
            const { peer1 } = await batchingPair(site);

            const exchanges = await captureInvokeExchanges(() =>
                Promise.all([
                    drain(peer1.interaction.invoke(onOffInvoke("on"))),
                    drain(peer1.interaction.invoke(onOffInvoke("toggle", { additionalMrpDelay: Seconds(3) }))),
                ]),
            );

            expect(exchanges.length).equals(2);
            const delays = exchanges.map(({ additionalDelay }) => additionalDelay ?? 0);
            expect(delays).include(Seconds(3));
            expect(delays.filter(delay => delay < Seconds(3)).length).equals(1);
        });

        it("command with an address override keeps it", async () => {
            await using site = new MockSite();
            const { peer1 } = await batchingPair(site);

            const [first] = await captureInvokeExchanges(() => drain(peer1.interaction.invoke(onOffInvoke("on"))));
            const { ip, port } = first.peerAddress!;
            const addressOverride: ServerAddressUdp = { type: "udp", ip, port };

            const exchanges = await captureInvokeExchanges(() =>
                Promise.all([
                    drain(peer1.interaction.invoke(onOffInvoke("toggle"))),
                    drain(peer1.interaction.invoke(onOffInvoke("on", { addressOverride }))),
                ]),
            );

            expect(exchanges.map(({ commandCount }) => commandCount)).deep.equals([1, 1]);
            expect(exchanges.map(exchange => exchange.addressOverride)).deep.include(addressOverride);
        });

        it("commands without options share a batch (characterization)", async () => {
            // Passes on the old code too, but is the only guard that the revision Invoke() sets by default does not
            // block batching
            await using site = new MockSite();
            const { peer1, device } = await batchingPair(site);

            const exchanges = await captureInvokeExchanges(() =>
                Promise.all([
                    drain(peer1.interaction.invoke(onOffInvoke("on"))),
                    drain(peer1.interaction.invoke(onOffInvoke("toggle"))),
                ]),
            );

            expect(exchanges.length).equals(1);
            expect(exchanges[0].commandCount).equals(2);
            expect(exchanges[0].expectedProcessingTime).undefined;
            expect(device.parts.get(1)!.stateOf(OnOffServer).onOff).equals(false);
        });

        it("command with options goes out alone and ahead of the batch invoked before it", async () => {
            await using site = new MockSite();
            const { peer1 } = await batchingPair(site);

            const exchanges = await captureInvokeExchanges(() =>
                Promise.all([
                    drain(peer1.interaction.invoke(onOffInvoke("on", { batchDuration: Seconds(1) }))),
                    drain(peer1.interaction.invoke(onOffInvoke("off", { expectedProcessingTime: Seconds(90) }))),
                    drain(peer1.interaction.invoke(onOffInvoke("toggle", { batchDuration: Seconds(1) }))),
                ]),
            );

            expect(
                exchanges.map(({ commandCount, expectedProcessingTime }) => ({ commandCount, expectedProcessingTime })),
            ).deep.equals([
                { commandCount: 1, expectedProcessingTime: Seconds(90) },
                { commandCount: 2, expectedProcessingTime: undefined },
            ]);
        });

        it("commands for different networks go into separate batches", async () => {
            await using site = new MockSite();
            const { peer1 } = await batchingPair(site);

            const exchanges = await captureInvokeExchanges(() =>
                Promise.all([
                    drain(peer1.interaction.invoke(onOffInvoke("on"))),
                    drain(peer1.interaction.invoke(onOffInvoke("toggle", { network: "icdLit" }))),
                ]),
            );

            expect(exchanges.map(({ commandCount, network }) => ({ commandCount, network }))).deep.members([
                { commandCount: 1, network: "unlimited" },
                { commandCount: 1, network: "icdLit" },
            ]);
        });

        it("batches for different networks do not wait on each other", async () => {
            await using site = new MockSite();
            const { peer1 } = await batchingPair(site);

            const start = Time.nowMs;
            const finished = new Array<number>();
            const timed = (request: ClientInvoke) =>
                drain(peer1.interaction.invoke(request)).then(() => {
                    finished.push(Time.nowMs - start);
                });

            await captureInvokeExchanges(
                () => Promise.all([timed(onOffInvoke("on")), timed(onOffInvoke("toggle", { network: "icdLit" }))]),
                Seconds(10),
            );

            expect(finished.length).equals(2);
            expect(Math.min(...finished)).lessThan(Seconds(10));
            expect(Math.max(...finished)).at.least(Seconds(10));
        });

        it("command without a network and one naming the default network share a batch", async () => {
            await using site = new MockSite();
            const { controller, peer1 } = await batchingPair(site);

            await using interaction = new ClientInteraction({
                environment: controller.env,
                exchangeProvider: controller.env.get(PeerSet).for(peer1.state.commissioning.peerAddress!)
                    .exchangeProvider,
                network: "unlimited",
            });

            const exchanges = await captureInvokeExchanges(() =>
                Promise.all([
                    drain(interaction.invoke(onOffInvoke("on"))),
                    drain(interaction.invoke(onOffInvoke("toggle", { network: "unlimited" }))),
                ]),
            );

            expect(exchanges.map(({ commandCount }) => commandCount)).deep.equals([2]);
        });

        it("command queued while the interaction closes is rejected with the close reason", async () => {
            await using site = new MockSite();
            const { controller, peer1 } = await batchingPair(site);

            const { exchangeProvider } = controller.env.get(PeerSet).for(peer1.state.commissioning.peerAddress!);
            const interaction = new ClientInteraction({ environment: controller.env, exchangeProvider });

            const { promise: connecting, resolver: connected } = createPromise<void>();
            const { promise: released, resolver: release } = createPromise<void>();
            const connect = exchangeProvider.connect;
            exchangeProvider.connect = async () => {
                connected();
                await released;
            };

            const reason = new ClosedError("closed for test");
            let rejection: unknown;
            try {
                const exchanges = await captureInvokeExchanges(async () => {
                    const invoked = drain(interaction.invoke(onOffInvoke("on"))).catch(error => {
                        rejection = error;
                    });
                    await connecting;
                    const closed = interaction.close(reason);
                    release();
                    await Promise.all([invoked, closed]);
                });
                expect(exchanges.length).equals(0);
            } finally {
                exchangeProvider.connect = connect;
            }

            expect(rejection).equals(reason);
        });

        it("direct invoke keeps its expected processing time (characterization)", async () => {
            await using site = new MockSite();
            const { peer1 } = await batchingPair(site);

            const exchanges = await captureInvokeExchanges(() =>
                drain(
                    peer1.interaction.invoke(
                        onOffInvoke("on", { expectedProcessingTime: Seconds(90), batchDuration: false }),
                    ),
                ),
            );

            expect(exchanges.length).equals(1);
            expect(exchanges[0].expectedProcessingTime).equals(Seconds(90));
        });
    });

    it("stops the batch exchange of a command whose acting context aborts", async () => {
        await using site = new MockSite();
        const { peer1, device } = await batchingPair(site);
        const network = device.env.get(Network);
        if (!(network instanceof MockNetwork)) {
            throw new InternalError("Mock network required");
        }
        // The device answers nothing, so the controller retransmits the invoke until its exchange stops
        let silenced = false;
        network.simulator.router.intercept((packet, route) => {
            if (silenced && network.shouldReceive(packet.sourceAddress)) {
                return;
            }
            route(packet);
        });
        let invokesSent = 0;
        const channelSend = MessageChannel.prototype.send;
        MessageChannel.prototype.send = function (message, options) {
            if (silenced && message.payloadHeader.messageType === MessageType.InvokeRequest) {
                invokesSent++;
            }
            return channelSend.call(this, message, options);
        };
        try {
            silenced = true;
            const abort = new AbortController();
            let caught: unknown;
            const invoking = Promise.resolve(
                peer1.endpoints.for(1).act("toggle", agent => agent.get(OnOffClient).toggle(), { abort: abort.signal }),
            ).catch(error => (caught = error));
            await MockTime.resolve(
                (async () => {
                    while (invokesSent === 0) {
                        await MockTime.macrotask;
                    }
                })(),
            );

            abort.abort();
            await MockTime.resolve(invoking);
            expect(caught).instanceof(AbortedError);
            const sentAtAbort = invokesSent;
            await MockTime.advance(Seconds(10));
            await MockTime.macrotask;

            expect(invokesSent).equals(sentAtAbort);
        } finally {
            MessageChannel.prototype.send = channelSend;
        }
    });

    it("correctly splits different-path commands when maxPathsPerInvoke is 1", async () => {
        await using site = new MockSite();
        // Device advertises maxPathsPerInvoke=1 — the server enforces this limit
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: { maxPathsPerInvoke: 1 },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // Get initial state, normally off, thats why rest relies on that
        const initialState = device.parts.get(1)!.stateOf(OnOffServer).onOff;
        expect(initialState).equals(false);

        // Issue two different commands in the same tick — they have different path keys so
        // #partitionBatch puts them in the same sub-batch.
        // maxPathsPerInvoke=1 causes #invokeWithSplitting to be called with maxPaths=1.
        //
        // Before the fix: each split's batchRequest kept all original invokeRequests →
        // the server received 2 paths → rejected with InvalidAction(128).
        // After the fix: each split's invokeRequests is filtered to only its own command →
        // the server receives 1 path per exchange → both succeed.
        const p1 = cmds.on();
        const p2 = cmds.toggle();

        await MockTime.resolve(Promise.all([p1, p2]));

        // on() (false→true) then toggle() (true→false) — final state is back to initial
        const finalState = device.parts.get(1)!.stateOf(OnOffServer).onOff;
        expect(finalState).equals(initialState);
    });

    it("splits duplicate command paths into separate batches", async () => {
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair({
            device: {
                type: ServerNode.RootEndpoint,
                basicInformation: {
                    maxPathsPerInvoke: 10,
                },
            },
        });

        const peer1 = controller.peers.get("peer1")!;
        expect(peer1).not.undefined;

        const ep1 = peer1.endpoints.for(1);
        const cmds = ep1.commandsOf(OnOffClient);

        // Get initial state
        const initialState = device.parts.get(1)!.stateOf(OnOffServer).onOff;

        // Fire two toggles in the same tick — same endpoint/cluster/command path
        // Without splitting, the server would reject with InvalidAction
        const p1 = cmds.toggle();
        const p2 = cmds.toggle();

        await MockTime.resolve(Promise.all([p1, p2]));

        // Two toggles: state should be back to initial (toggled twice)
        const finalState = device.parts.get(1)!.stateOf(OnOffServer).onOff;
        expect(finalState).equals(initialState);
    });
});
