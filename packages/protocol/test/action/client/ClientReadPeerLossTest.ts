/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientInteraction } from "#action/client/ClientInteraction.js";
import { Read } from "#action/request/Read.js";
import { SessionType } from "#codec/MessageCodec.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { MessageType } from "#interaction/InteractionMessenger.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import { ExchangeProvider } from "#protocol/ExchangeProvider.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { SessionManager } from "#session/SessionManager.js";
import {
    ChannelType,
    Entropy,
    Environment,
    MemoryStorageDriver,
    Seconds,
    StandardCrypto,
    StorageContext,
    TransportSet,
} from "@matter/general";
import { Specification } from "@matter/model";
import { INTERACTION_PROTOCOL_ID, TlvDataReport } from "@matter/types";

class ReadExchangeProvider extends ExchangeProvider {
    constructor(
        manager: ExchangeManager,
        readonly exchange: MessageExchange,
    ) {
        super(manager);
    }

    readonly channelType = ChannelType.UDP;
    readonly peerAddress = undefined;
    readonly maxPathsPerInvoke = 1;

    maximumPeerResponseTime() {
        return Seconds(1);
    }

    async initiateExchange() {
        return this.exchange;
    }
}

describe("Client read peer-loss scope", () => {
    for (const suppressPeerLoss of [undefined, false, true]) {
        it(`passes ${suppressPeerLoss} to both request send and report receive`, async () => {
            const environment = new Environment("read scope");
            const storage = new MemoryStorageDriver();
            storage.initialize();
            const crypto = new StandardCrypto();
            environment.set(Entropy, crypto);
            const sessions = new SessionManager({
                fabrics: new FabricManager(crypto),
                storage: new StorageContext(storage, ["sessions"]),
            });
            await sessions.construction.ready;
            const exchanges = new ExchangeManager({
                lifetime: environment,
                entropy: crypto,
                sessions,
                transports: new TransportSet(),
            });
            const exchange: MessageExchange = new ProtocolMocks.Exchange({
                protocolId: INTERACTION_PROTOCOL_ID,
            });
            let sendScope: boolean | undefined;
            let receiveScope: boolean | undefined;
            exchange.send = async (_type, _payload, options) => {
                sendScope = options?.suppressPeerLoss;
            };
            exchange.nextMessage = async options => {
                receiveScope = options?.suppressPeerLoss;
                return {
                    packetHeader: {
                        sessionId: 1,
                        sessionType: SessionType.Unicast,
                        messageId: 1,
                        hasPrivacyEnhancements: false,
                        isControlMessage: false,
                        hasMessageExtensions: false,
                    },
                    payloadHeader: {
                        protocolId: INTERACTION_PROTOCOL_ID,
                        messageType: MessageType.ReportData,
                        exchangeId: 1,
                        isInitiatorMessage: false,
                        requiresAck: false,
                        hasSecuredExtension: false,
                    },
                    payload: TlvDataReport.encode({
                        suppressResponse: true,
                        interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    }),
                };
            };
            const client = new ClientInteraction({
                environment,
                exchangeProvider: new ReadExchangeProvider(exchanges, exchange),
            });
            try {
                const request = Object.assign(Read({ attributes: [{}] }), { suppressPeerLoss });
                for await (const _chunk of client.read(request));
                expect(sendScope).equal(suppressPeerLoss);
                expect(receiveScope).equal(suppressPeerLoss);
            } finally {
                await client.close();
                await exchanges.close();
                await sessions.close();
                environment[Symbol.dispose]();
            }
        });
    }
});
