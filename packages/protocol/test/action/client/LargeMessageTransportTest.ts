/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientInteraction } from "#action/client/ClientInteraction.js";
import { Read } from "#action/request/Read.js";
import { MessageType } from "#interaction/InteractionMessenger.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { ExchangeProvider, NewExchangeOptions } from "#protocol/ExchangeProvider.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { ChannelType, Duration, Environment, Seconds } from "@matter/general";
import { Specification } from "@matter/model";
import { AttributeId, ClusterId, EndpointNumber, TlvDataReport } from "@matter/types";
import { createDummyMessageExchange } from "../../interaction/interaction-utils.js";

/** Records the options each interaction hands `initiateExchange`, which is where transport is decided. */
class RecordingExchangeProvider extends ExchangeProvider {
    readonly requested = new Array<NewExchangeOptions | undefined>();

    constructor(private readonly exchange: MessageExchange) {
        super(undefined as unknown as ExchangeManager);
    }

    readonly channelType = ChannelType.UDP;
    readonly peerAddress = undefined;
    readonly maxPathsPerInvoke = 10;

    maximumPeerResponseTime(): Duration {
        return Seconds(30);
    }

    async initiateExchange(options?: NewExchangeOptions): Promise<MessageExchange> {
        this.requested.push(options);
        return this.exchange;
    }
}

async function readWith(options: { largeMessage?: boolean }) {
    const exchange = await createDummyMessageExchange(false, false, messageType => {
        if (messageType === MessageType.ReadRequest) {
            return {
                messageType: MessageType.ReportData,
                payload: TlvDataReport.encode({
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    suppressResponse: true,
                }),
            };
        }
    });

    const provider = new RecordingExchangeProvider(exchange);
    const client = new ClientInteraction({ environment: Environment.default, exchangeProvider: provider });

    const request = {
        ...Read({
            attributes: [
                {
                    endpointId: EndpointNumber(0),
                    clusterId: ClusterId(0x28),
                    attributeId: AttributeId(1),
                },
            ],
        }),
        ...options,
    };

    try {
        for await (const chunk of client.read(request)) {
            for await (const _report of chunk) {
                // The response carries no data; this drains the result so the interaction completes
            }
        }
    } finally {
        await client.close();
    }

    return provider.requested;
}

describe("largeMessage transport requirement", () => {
    // The flag lives on ClientRequest rather than on an invoke, so a read must reach the same
    // decision an invoke does: a large-payload session runs over TCP, and asking for one is a hard
    // requirement rather than a preference the connect path may abandon.
    it("requires TCP for a read that asks for a large payload", async () => {
        const requested = await readWith({ largeMessage: true });

        expect(requested).length(1);
        expect(requested[0]?.requiredTransport).equal(ChannelType.TCP);
    });

    it("requires no particular transport for a read that does not", async () => {
        const requested = await readWith({});

        expect(requested).length(1);
        expect(requested[0]?.requiredTransport).equal(undefined);
    });

    it("requires no particular transport when the flag is explicitly false", async () => {
        const requested = await readWith({ largeMessage: false });

        expect(requested).length(1);
        expect(requested[0]?.requiredTransport).equal(undefined);
    });
});
