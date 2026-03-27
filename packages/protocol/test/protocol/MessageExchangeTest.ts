/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Message } from "#codec/MessageCodec.js";
import { MessageExchange } from "#protocol/MessageExchange.js";
import { ProtocolMocks } from "#protocol/ProtocolMocks.js";
import { SessionParameters } from "#session/SessionParameters.js";
import { Bytes, Millis, NetworkError } from "@matter/general";
import { SECURE_CHANNEL_PROTOCOL_ID } from "@matter/types";

/**
 * Creates a NodeSession whose channel send() throws to simulate a hard network failure.
 *
 * We override send on the channel instance rather than subclassing because the Session
 * setter guards against channel replacement after construction.
 */
function makeThrowingSession(): ProtocolMocks.NodeSession {
    const session = new ProtocolMocks.NodeSession();
    (session.channel as any).send = async (_message: Message): Promise<void> => {
        throw new NetworkError("Simulated network failure");
    };
    return session;
}



/**
 * Creates a MessageExchange with a trackable peerLost spy.
 */
function createExchange(session: ProtocolMocks.NodeSession) {
    const peerLostCalled = { value: false };
    const exchange = MessageExchange.initiate(
        {
            session,
            localSessionParameters: SessionParameters(SessionParameters.defaults),
            async peerLost() {
                peerLostCalled.value = true;
            },
            retry() {},
        },
        1,
        SECURE_CHANNEL_PROTOCOL_ID,
    );
    return { exchange, peerLostCalled };
}

/**
 * A minimal inbound message compatible with MessageExchange.onMessageReceived():
 * - requiresAck: false so no ack send is triggered on the channel
 * - protocolId matches the exchange protocol to pass the protocol check
 */
function fakeInboundMessage(): Message {
    return {
        packetHeader: { messageId: 1 },
        payloadHeader: {
            protocolId: SECURE_CHANNEL_PROTOCOL_ID,
            messageType: 1,
            exchangeId: 1,
            isInitiatorMessage: false,
            requiresAck: false,
            ackedMessageId: undefined,
        },
        payload: Bytes.empty,
    } as unknown as Message;
}

describe("MessageExchange", () => {
    describe("peer loss declaration", () => {
        describe("send()", () => {
            it("declares peer lost when exchange has received no messages", async () => {
                const { exchange, peerLostCalled } = createExchange(makeThrowingSession());

                await expect(exchange.send(0, Bytes.empty)).to.be.rejectedWith(NetworkError);

                expect(peerLostCalled.value).to.be.true;
            });

            it("does not declare peer lost when exchange already received at least one message", async () => {
                const { exchange, peerLostCalled } = createExchange(makeThrowingSession());

                await exchange.onMessageReceived(fakeInboundMessage());
                await expect(exchange.send(0, Bytes.empty)).to.be.rejectedWith(NetworkError);

                expect(peerLostCalled.value).to.be.false;
            });
        });

        describe("nextMessage()", () => {
            it("declares peer lost when exchange has received no messages", async () => {
                const session = new ProtocolMocks.NodeSession();
                const { exchange, peerLostCalled } = createExchange(session);

                await expect(exchange.nextMessage({ timeout: Millis(0) })).to.be.rejected;

                expect(peerLostCalled.value).to.be.true;
            });

            it("does not declare peer lost when exchange already received at least one message", async () => {
                const session = new ProtocolMocks.NodeSession();
                const { exchange, peerLostCalled } = createExchange(session);

                // Deliver and drain one inbound message so the received counter is > 0
                await exchange.onMessageReceived(fakeInboundMessage());
                await exchange.nextMessage({ timeout: Millis(0) }); // drains the queued message

                // Subsequent timeout with an empty queue should not declare peer lost
                await expect(exchange.nextMessage({ timeout: Millis(0) })).to.be.rejected;

                expect(peerLostCalled.value).to.be.false;
            });
        });
    });

});
