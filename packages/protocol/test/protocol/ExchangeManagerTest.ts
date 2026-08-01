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

    /** A manager whose sole session fails every send, with a subscription recording its own teardown. */
    async function failingPeer() {
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

        const closedWith = new Array<MessageExchange | undefined>();
        session.subscriptions.add({
            subscriptionId: 1,
            isCanceledByPeer: false,
            async handlePeerCancel() {},
            async close(_flushViaSession, exchange) {
                closedWith.push(exchange);
            },
        });

        // Peer loss ignores sessions created no earlier than the failing exchange
        await MockTime.advance(1000);

        return {
            session,
            closedWith,
            exchanges,
            async [Symbol.asyncDispose]() {
                await exchanges.close();
                await sessions.close();
            },
        };
    }

    describe("peer loss", () => {
        it("conveys the failing exchange so its own subscription does not wait on itself", async () => {
            await using peer = await failingPeer();

            const exchange = peer.exchanges.initiateExchangeForSession(peer.session, SECURE_CHANNEL_PROTOCOL_ID);
            await expect(exchange.send(0, Bytes.empty)).to.be.rejectedWith(NetworkError);

            expect(peer.closedWith[0]).equals(exchange);
        });

        it("leaves the session and its subscriptions alone when the exchange suppresses peer loss", async () => {
            await using peer = await failingPeer();

            const exchange = peer.exchanges.initiateExchangeForSession(peer.session, SECURE_CHANNEL_PROTOCOL_ID, {
                suppressPeerLoss: true,
            });
            await expect(exchange.send(0, Bytes.empty)).to.be.rejectedWith(NetworkError);

            expect(peer.closedWith).is.empty;
            expect(peer.session.isClosing).is.false;
            expect(peer.session.isPeerLost).is.false;
        });
    });
});
