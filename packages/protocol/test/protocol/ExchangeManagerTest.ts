/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from "#codec/MessageCodec.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { SessionParameters } from "#index.js";
import { ExchangeManager } from "#protocol/ExchangeManager.js";
import type { MessageExchange } from "#protocol/MessageExchange.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { SessionManager } from "#session/SessionManager.js";
import {
    Bytes,
    Environment,
    MemoryStorageDriver,
    NetworkError,
    StandardCrypto,
    StorageContext,
    TransportSet,
} from "@matter/general";
import { SECURE_CHANNEL_PROTOCOL_ID } from "@matter/types";

describe("ExchangeManager", () => {
    before(() => MockTime.init());

    describe("peer loss", () => {
        it("conveys the failing exchange so its own subscription does not wait on itself", async () => {
            const environment = new Environment("test");
            const storage = new MemoryStorageDriver();
            storage.initialize();

            const crypto = new StandardCrypto();
            const sessions = new SessionManager({
                parameters: {} as SessionParameters,
                fabrics: new FabricManager(crypto),
                storage: new StorageContext(storage, ["context"]),
            });
            await sessions.construction.ready;

            const exchanges = new ExchangeManager({
                lifetime: environment,
                entropy: crypto,
                transports: new TransportSet(),
                sessions,
            });

            const session = new ProtocolMocks.NodeSession({ manager: sessions });
            (session.channel as any).send = async (_message: Message): Promise<void> => {
                throw new NetworkError("Simulated network failure");
            };

            const received = new Array<MessageExchange | undefined>();
            session.subscriptions.add({
                subscriptionId: 1,
                isCanceledByPeer: false,
                async handlePeerCancel() {},
                async close(_flushViaSession, exchange) {
                    received.push(exchange);
                },
            });

            // Peer loss ignores sessions created no earlier than the failing exchange
            await MockTime.advance(1000);

            const exchange = exchanges.initiateExchangeForSession(session, SECURE_CHANNEL_PROTOCOL_ID);
            await expect(exchange.send(0, Bytes.empty)).to.be.rejectedWith(NetworkError);

            expect(received[0]).equals(exchange);

            await exchanges.close();
            await sessions.close();
        });
    });
});
