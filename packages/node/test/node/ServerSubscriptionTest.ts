/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ServerSubscription, ServerSubscriptionConfig } from "#node/server/ServerSubscription.js";
import { DataReadQueue, Millis } from "@matter/general";
import { MessageExchange, NodeSession } from "@matter/protocol";
import { MockServerNode } from "./mock-server-node.js";

describe("ServerSubscription", () => {
    before(() => {
        MockTime.init();
    });

    // Shared helper to create a minimal subscription for unit-testing handlePeerCancel.
    // Uses a real NodeSession (from the mock node) so session.subscriptions and session.join() work,
    // but stubs the node and initiateExchange to the minimum needed.
    async function createSubscription(
        node: MockServerNode,
        makeExchange: () => MessageExchange,
    ): Promise<ServerSubscription> {
        const fabric = await node.addFabric();
        const session = (await node.createExchange({ fabric })).session as NodeSession;

        return new ServerSubscription({
            id: 1,
            context: {
                session,
                // node is only accessed when attributeRequests / eventRequests are set; we use neither
                node: node as any,
                initiateExchange: makeExchange,
            },
            request: {
                minIntervalFloorSeconds: 0,
                maxIntervalCeilingSeconds: 60,
                // No attributeRequests / eventRequests → keepalive-only sends, no RemoteActorContext needed
                isFabricFiltered: false,
            },
            subscriptionOptions: ServerSubscriptionConfig.of(),
            // Use fixed short intervals so tests don't depend on randomization
            useAsMaxInterval: Millis(200),
            useAsSendInterval: Millis(100),
        });
    }

    it("sets isCanceledByPeer and removes from session when peer cancels", async () => {
        const node = await MockServerNode.createOnline();

        const subscription = await createSubscription(node, () => ({}) as any);
        const session = subscription.session as NodeSession;

        subscription.activate();

        expect(subscription.isCanceledByPeer).is.false;
        expect([...session.subscriptions]).has.length(1);

        await subscription.handlePeerCancel();

        expect(subscription.isCanceledByPeer).is.true;
        expect([...session.subscriptions]).is.empty;

        await MockTime.resolve(node.close());
    });

    it("closes subscription even when in-flight exchange close throws", async () => {
        // This test verifies the try/finally fix: if exchange.close() throws, this.close()
        // must still run so the subscription is properly removed.
        const node = await MockServerNode.createOnline();

        // A DataReadQueue blocks exchange.send() until handlePeerCancel() closes it.
        const sendBlocker = new DataReadQueue<void>();
        let exchangeCloseThrew = false;

        const subscription = await createSubscription(node, () => {
            return {
                maxPayloadSize: 1200,
                // Called by messenger.sendDataReport() → sendDataReportMessage()
                async send(_messageType: number, _payload: unknown, _options?: unknown) {
                    await sendBlocker.read(); // blocks until handlePeerCancel closes it
                },
                // Called by handlePeerCancel (with cause) and messenger.close() (without cause)
                async close(cause?: Error) {
                    sendBlocker.close(cause); // unblock the send (idempotent on second call)
                    if (cause) {
                        exchangeCloseThrew = true;
                        throw new Error("Simulated exchange close error");
                    }
                },
            } as unknown as MessageExchange;
        });

        const session = subscription.session as NodeSession;
        subscription.activate();

        // Advance time to fire the 100 ms send timer + 50 ms delay timer.
        // After this call returns, #currentSendExchange is set and send() is blocked inside sendBlocker.read().
        await MockTime.advance(200);

        // subscription is mid-send; now cancel it.
        // handlePeerCancel() calls exchange.close(cause) → sendBlocker.close(cause) + throws,
        // the catch block logs the error, and the finally block calls this.close() regardless.
        await MockTime.resolve(subscription.handlePeerCancel());

        expect(exchangeCloseThrew).is.true;
        expect(subscription.isCanceledByPeer).is.true;
        expect([...session.subscriptions]).is.empty;

        await MockTime.resolve(node.close());
    });
});
