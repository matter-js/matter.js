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
import { MessageExchange } from "#protocol/MessageExchange.js";
import { ChannelType, Duration, Environment, Seconds } from "@matter/general";
import { Specification } from "@matter/model";
import { ClusterId, CommandId, EndpointNumber, InvokeResponse, Status, TlvInvokeResponse } from "@matter/types";
import { OnOff } from "@matter/types/clusters/on-off";
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
