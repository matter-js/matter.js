/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientInteraction } from "#action/client/ClientInteraction.js";
import { Invoke } from "#action/request/Invoke.js";
import { InvokeResult } from "#action/response/InvokeResult.js";
import { MessageType } from "#interaction/InteractionMessenger.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { ExchangeProvider } from "#protocol/ExchangeProvider.js";
import { ExchangeReceiveOptions, MessageExchange } from "#protocol/MessageExchange.js";
import { AbortedError, ChannelType, ClosedError, createPromise, Duration, Environment, Seconds } from "@matter/general";
import { Specification } from "@matter/model";
import {
    ClusterId,
    CommandId,
    EndpointNumber,
    InvokeRequest,
    InvokeResponse,
    Status,
    TlvInvokeRequest,
    TlvInvokeResponse,
} from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";
import { WebRtcTransportProvider } from "@matter/types/clusters/web-rtc-transport-provider";
import { createDummyMessageExchange } from "../../interaction/interaction-utils.js";

const ON_OFF_CLUSTER_ID = ClusterId(0x6);
const ON_COMMAND_ID = 1;
const OFF_COMMAND_ID = 0;

class FakeExchangeProvider extends ExchangeProvider {
    constructor(private readonly exchange: MessageExchange) {
        super(undefined as unknown as ExchangeManager);
    }

    readonly channelType = ChannelType.UDP;
    readonly peerAddress = undefined;
    readonly maxPathsPerInvoke = 10;

    maximumPeerResponseTime(): Duration {
        return Seconds(30);
    }

    async initiateExchange(): Promise<MessageExchange> {
        return this.exchange;
    }
}

async function invokeWithCraftedResponse(
    request: ReturnType<typeof Invoke>,
    invokeResponses: InvokeResponse["invokeResponses"],
) {
    const exchange = await createDummyMessageExchange(false, false, messageType => {
        if (messageType === MessageType.InvokeRequest) {
            return {
                messageType: MessageType.InvokeResponse,
                payload: TlvInvokeResponse.encode({
                    suppressResponse: false,
                    invokeResponses,
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                }),
            };
        }
    });

    const client = new ClientInteraction({
        environment: Environment.default,
        exchangeProvider: new FakeExchangeProvider(exchange),
    });

    const entries = new Array<InvokeResult.Data>();
    try {
        for await (const chunk of client.invoke(request)) {
            entries.push(...chunk);
        }
    } finally {
        await client.close();
    }
    return entries;
}

const twoOnOffCommands = () =>
    Invoke(
        Invoke.ConcreteCommandRequest({ endpoint: EndpointNumber(1), cluster: OnOff, command: "on", commandRef: 1 }),
        Invoke.ConcreteCommandRequest({ endpoint: EndpointNumber(1), cluster: OnOff, command: "off", commandRef: 2 }),
    );

const successStatus = (commandId: number, commandRef: number): InvokeResponse["invokeResponses"][number] => ({
    status: {
        commandPath: { endpointId: EndpointNumber(1), clusterId: ON_OFF_CLUSTER_ID, commandId: CommandId(commandId) },
        status: { status: Status.Success },
        commandRef,
    },
});

const commandData = (commandId: number, commandRef: number): InvokeResponse["invokeResponses"][number] => ({
    command: {
        commandPath: { endpointId: EndpointNumber(1), clusterId: ON_OFF_CLUSTER_ID, commandId: CommandId(commandId) },
        commandRef,
    },
});

describe("ClientInteraction invoke response reconciliation", () => {
    it("synthesizes NO_COMMAND_RESPONSE for a request command that received no response", async () => {
        const entries = await invokeWithCraftedResponse(twoOnOffCommands(), [successStatus(ON_COMMAND_ID, 1)]);

        expect(entries).deep.equals([
            {
                kind: "cmd-status",
                path: { endpointId: 1, clusterId: ON_OFF_CLUSTER_ID, commandId: ON_COMMAND_ID },
                commandRef: 1,
                status: Status.Success,
                clusterStatus: undefined,
            },
            {
                kind: "cmd-status",
                path: { endpointId: 1, clusterId: ON_OFF_CLUSTER_ID, commandId: OFF_COMMAND_ID },
                commandRef: 2,
                status: Status.NoCommandResponse,
                clusterStatus: undefined,
            },
        ]);
    });

    it("does not synthesize NO_COMMAND_RESPONSE for an unanswered wildcard command (no concrete path)", async () => {
        const request = Invoke(Invoke.WildcardCommandRequest({ cluster: OnOff, command: "on", commandRef: 1 }));

        const entries = await invokeWithCraftedResponse(request, []);

        expect(entries).deep.equals([]);
    });

    it("discards a stray CommandDataIB that matches no sent command instead of throwing", async () => {
        const entries = await invokeWithCraftedResponse(twoOnOffCommands(), [
            successStatus(ON_COMMAND_ID, 1),
            successStatus(OFF_COMMAND_ID, 2),
            commandData(ON_COMMAND_ID, 99),
        ]);

        expect(entries).deep.equals([
            {
                kind: "cmd-status",
                path: { endpointId: 1, clusterId: ON_OFF_CLUSTER_ID, commandId: ON_COMMAND_ID },
                commandRef: 1,
                status: Status.Success,
                clusterStatus: undefined,
            },
            {
                kind: "cmd-status",
                path: { endpointId: 1, clusterId: ON_OFF_CLUSTER_ID, commandId: OFF_COMMAND_ID },
                commandRef: 2,
                status: Status.Success,
                clusterStatus: undefined,
            },
        ]);
    });

    it("passes a stray CommandStatusIB up to the caller (spec submits all status entries)", async () => {
        const entries = await invokeWithCraftedResponse(twoOnOffCommands(), [
            successStatus(ON_COMMAND_ID, 1),
            successStatus(OFF_COMMAND_ID, 2),
            successStatus(ON_COMMAND_ID, 99),
        ]);

        expect(entries).deep.equals([
            {
                kind: "cmd-status",
                path: { endpointId: 1, clusterId: ON_OFF_CLUSTER_ID, commandId: ON_COMMAND_ID },
                commandRef: 1,
                status: Status.Success,
                clusterStatus: undefined,
            },
            {
                kind: "cmd-status",
                path: { endpointId: 1, clusterId: ON_OFF_CLUSTER_ID, commandId: OFF_COMMAND_ID },
                commandRef: 2,
                status: Status.Success,
                clusterStatus: undefined,
            },
            {
                kind: "cmd-status",
                path: { endpointId: 1, clusterId: ON_OFF_CLUSTER_ID, commandId: ON_COMMAND_ID },
                commandRef: 99,
                status: Status.Success,
                clusterStatus: undefined,
            },
        ]);
    });
});

/**
 * Emulates a device that does not echo commandRef in responses (pre-Matter-1.4 servers ignore the
 * field entirely).  Responds to each received command with a ref-less Success status and records
 * every InvokeRequest as sent on the wire.
 */
class RefLessDeviceExchangeProvider extends ExchangeProvider {
    constructor(
        readonly maxPathsPerInvoke: number,
        private readonly sentRequests: InvokeRequest[],
    ) {
        super(undefined as unknown as ExchangeManager);
    }

    readonly channelType = ChannelType.UDP;
    readonly peerAddress = undefined;

    maximumPeerResponseTime(): Duration {
        return Seconds(30);
    }

    async initiateExchange(): Promise<MessageExchange> {
        return createDummyMessageExchange(false, false, (messageType, payload) => {
            if (messageType === MessageType.InvokeRequest) {
                const request = TlvInvokeRequest.decode(payload);
                this.sentRequests.push(request);
                return {
                    messageType: MessageType.InvokeResponse,
                    payload: TlvInvokeResponse.encode({
                        suppressResponse: false,
                        invokeResponses: request.invokeRequests.map(({ commandPath }) => ({
                            status: { commandPath, status: { status: Status.Success } },
                        })),
                        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    }),
                };
            }
        });
    }
}

/**
 * Emulates a device that receives commands but never responds.  {@link sendObserved} resolves once
 * the request left the client; the exchange then blocks in nextMessage until aborted.
 */
class HangingDeviceExchangeProvider extends ExchangeProvider {
    readonly maxPathsPerInvoke = 10;
    readonly channelType = ChannelType.UDP;
    readonly peerAddress = undefined;

    #sendObserved = createPromise<void>();

    get sendObserved() {
        return this.#sendObserved.promise;
    }

    constructor() {
        super(undefined as unknown as ExchangeManager);
    }

    maximumPeerResponseTime(): Duration {
        return Seconds(30);
    }

    async initiateExchange(): Promise<MessageExchange> {
        const exchange = await createDummyMessageExchange();
        exchange.send = async () => {
            this.#sendObserved.resolver();
        };
        exchange.nextMessage = (options?: ExchangeReceiveOptions) =>
            new Promise((_, reject) => {
                const abort = options?.abort;
                if (abort?.aborted) {
                    reject(new AbortedError());
                    return;
                }
                abort?.addEventListener("abort", () => reject(new AbortedError()), { once: true });
            });
        return exchange;
    }
}

describe("ClientInteraction invoke commandRef wire handling", () => {
    before(MockTime.enable);

    it("sends a single-command invoke without commandRef and matches the ref-less response", async () => {
        const sentRequests = new Array<InvokeRequest>();
        const client = new ClientInteraction({
            environment: Environment.default,
            exchangeProvider: new RefLessDeviceExchangeProvider(10, sentRequests),
        });

        const request = Invoke(
            Invoke.ConcreteCommandRequest({
                endpoint: EndpointNumber(1),
                cluster: OnOff,
                command: "off",
                commandRef: 5,
            }),
        );
        request.batchDuration = false;

        const entries = new Array<InvokeResult.Data>();
        try {
            for await (const chunk of client.invoke(request)) {
                entries.push(...chunk);
            }
        } finally {
            await client.close();
        }

        expect(sentRequests.length).equals(1);
        expect(sentRequests[0].invokeRequests[0].commandRef).equals(undefined);
        expect(entries).deep.equals([
            {
                kind: "cmd-status",
                path: { endpointId: 1, clusterId: ON_OFF_CLUSTER_ID, commandId: OFF_COMMAND_ID },
                commandRef: 5,
                status: Status.Success,
                clusterStatus: undefined,
            },
        ]);
    });

    it("splits a multi-command invoke for a maxPathsPerInvoke=1 peer into ref-less single invokes", async () => {
        const sentRequests = new Array<InvokeRequest>();
        const client = new ClientInteraction({
            environment: Environment.default,
            exchangeProvider: new RefLessDeviceExchangeProvider(1, sentRequests),
        });

        const entries = new Array<InvokeResult.Data>();
        try {
            for await (const chunk of client.invoke(twoOnOffCommands())) {
                entries.push(...chunk);
            }
        } finally {
            await client.close();
        }

        expect(sentRequests.length).equals(2);
        for (const sent of sentRequests) {
            expect(sent.invokeRequests.length).equals(1);
            expect(sent.invokeRequests[0].commandRef).equals(undefined);
        }
        entries.sort((a, b) => (a.commandRef ?? 0) - (b.commandRef ?? 0));
        expect(entries).deep.equals([
            {
                kind: "cmd-status",
                path: { endpointId: 1, clusterId: ON_OFF_CLUSTER_ID, commandId: ON_COMMAND_ID },
                commandRef: 1,
                status: Status.Success,
                clusterStatus: undefined,
            },
            {
                kind: "cmd-status",
                path: { endpointId: 1, clusterId: ON_OFF_CLUSTER_ID, commandId: OFF_COMMAND_ID },
                commandRef: 2,
                status: Status.Success,
                clusterStatus: undefined,
            },
        ]);
    });

    it("aborts an in-flight batch on close instead of awaiting its response", async () => {
        const provider = new HangingDeviceExchangeProvider();
        const client = new ClientInteraction({
            environment: Environment.default,
            exchangeProvider: provider,
        });

        const invokePromise = (async () => {
            for await (const _chunk of client.invoke(
                Invoke(Invoke.ConcreteCommandRequest({ endpoint: EndpointNumber(1), cluster: OnOff, command: "off" })),
            ));
        })();
        const rejection = expect(invokePromise).rejectedWith(AbortedError);

        // Race so a premature invoke rejection surfaces instead of hanging the send wait
        await MockTime.resolve(Promise.race([provider.sendObserved, invokePromise]));
        await MockTime.resolve(client.close());
        await rejection;
    });

    it("throws when invoked with an already-aborted session signal", async () => {
        const sentRequests = new Array<InvokeRequest>();
        const client = new ClientInteraction({
            environment: Environment.default,
            exchangeProvider: new RefLessDeviceExchangeProvider(10, sentRequests),
        });

        const controller = new AbortController();
        controller.abort();

        const invokePromise = (async () => {
            for await (const _chunk of client.invoke(
                Invoke(Invoke.ConcreteCommandRequest({ endpoint: EndpointNumber(1), cluster: OnOff, command: "off" })),
                { abort: controller.signal },
            ));
        })();

        try {
            await expect(MockTime.resolve(invokePromise)).rejectedWith(AbortedError);
            expect(sentRequests.length).equals(0);
        } finally {
            await client.close();
        }
    });

    it("rejects commands queued behind an in-flight batch with the close reason", async () => {
        const provider = new HangingDeviceExchangeProvider();
        const client = new ClientInteraction({
            environment: Environment.default,
            exchangeProvider: provider,
        });

        // Two identical paths cannot share one invoke message, so they partition into two sequential batches
        const collect = async () => {
            for await (const _chunk of client.invoke(
                Invoke(Invoke.ConcreteCommandRequest({ endpoint: EndpointNumber(1), cluster: OnOff, command: "off" })),
            ));
        };
        const first = collect();
        const second = collect();
        const firstRejection = expect(first).rejectedWith(AbortedError);
        const secondRejection = expect(second).rejectedWith(ClosedError);

        await MockTime.resolve(Promise.race([provider.sendObserved, first, second]));
        await MockTime.resolve(client.close());
        await firstRejection;
        await secondRejection;
    });

    it("does not mutate the caller's request when inferring largeMessage", async () => {
        const sentRequests = new Array<InvokeRequest>();
        const client = new ClientInteraction({
            environment: Environment.default,
            exchangeProvider: new RefLessDeviceExchangeProvider(10, sentRequests),
        });

        const request = Invoke({
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

        try {
            for await (const _chunk of client.invoke(request));
        } finally {
            await client.close();
        }

        expect(sentRequests.length).equals(1);
        expect(request.largeMessage).equals(undefined);
    });

    it("honors suppressResponse for a single command instead of batching it", async () => {
        const sentRequests = new Array<InvokeRequest>();
        const client = new ClientInteraction({
            environment: Environment.default,
            exchangeProvider: new RefLessDeviceExchangeProvider(10, sentRequests),
        });

        const request = Invoke({
            commands: [Invoke.ConcreteCommandRequest({ endpoint: EndpointNumber(1), cluster: OnOff, command: "off" })],
            suppressResponse: true,
        });

        const entries = new Array<InvokeResult.Data>();
        try {
            await MockTime.resolve(
                (async () => {
                    for await (const chunk of client.invoke(request)) {
                        entries.push(...chunk);
                    }
                })(),
            );
        } finally {
            await client.close();
        }

        expect(sentRequests.length).equals(1);
        expect(sentRequests[0].suppressResponse).equals(true);
        expect(entries).deep.equals([]);
    });

    it("invokes concurrent single commands directly and ref-less when peer maxPathsPerInvoke is 1", async () => {
        const sentRequests = new Array<InvokeRequest>();
        const client = new ClientInteraction({
            environment: Environment.default,
            exchangeProvider: new RefLessDeviceExchangeProvider(1, sentRequests),
        });

        const collect = async (endpoint: EndpointNumber) => {
            const request = Invoke(Invoke.ConcreteCommandRequest({ endpoint, cluster: OnOff, command: "off" }));
            const entries = new Array<InvokeResult.Data>();
            for await (const chunk of client.invoke(request)) {
                entries.push(...chunk);
            }
            return entries;
        };

        try {
            const [first, second] = await MockTime.resolve(
                Promise.all([collect(EndpointNumber(1)), collect(EndpointNumber(2))]),
            );

            expect(sentRequests.length).equals(2);
            for (const sent of sentRequests) {
                expect(sent.invokeRequests.length).equals(1);
                expect(sent.invokeRequests[0].commandRef).equals(undefined);
            }
            expect(first).deep.equals([
                {
                    kind: "cmd-status",
                    path: { endpointId: 1, clusterId: ON_OFF_CLUSTER_ID, commandId: OFF_COMMAND_ID },
                    commandRef: undefined,
                    status: Status.Success,
                    clusterStatus: undefined,
                },
            ]);
            expect(second).deep.equals([
                {
                    kind: "cmd-status",
                    path: { endpointId: 2, clusterId: ON_OFF_CLUSTER_ID, commandId: OFF_COMMAND_ID },
                    commandRef: undefined,
                    status: Status.Success,
                    clusterStatus: undefined,
                },
            ]);
        } finally {
            await client.close();
        }
    });
});
