/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdManagementServer } from "#behaviors/icd-management";
import { InteractionServer } from "#node/server/InteractionServer.js";
import { ServerSubscription, ServerSubscriptionConfig } from "#node/server/ServerSubscription.js";
import { DataReadQueue, Lifetime, Millis, NoResponseTimeoutError, Seconds } from "@matter/general";
import {
    ExchangeManager,
    InteractionServerMessenger,
    MessageExchange,
    NodeSession,
    PeerUnresponsiveError,
    ProtocolMocks,
    SessionManager,
} from "@matter/protocol";
import { AttributeId, AttributePath, ClusterId, EndpointNumber } from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { LIT_CONFIG } from "./icd-helpers.js";
import { MockServerNode } from "./mock-server-node.js";

function activeSpanNames(lifetime: Lifetime): string[] {
    const names = new Array<string>();
    for (const span of lifetime.spans) {
        names.push(String(span.name), ...activeSpanNames(span));
    }
    return names;
}

const RootWithLitIcd = MockServerNode.RootEndpoint.with(
    IcdManagementServer.with(IcdManagement.Feature.CheckInProtocolSupport, IcdManagement.Feature.LongIdleTimeSupport),
);

describe("ServerSubscription", () => {
    before(() => {
        MockTime.init();
    });

    // Shared helper to create a minimal subscription for unit-testing handlePeerCancel.
    // Uses a real NodeSession (from the mock node) so session.subscriptions and session.join() work,
    // but stubs the node and initiateExchange to the minimum needed.
    async function createSubscription<T extends MockServerNode.RootEndpoint>(
        node: MockServerNode<T>,
        makeExchange: () => MessageExchange,
        overrides?: {
            minIntervalFloorSeconds?: number;
            maxIntervalCeilingSeconds?: number;
            negotiateIntervals?: boolean;
            session?: NodeSession;
            attributeRequests?: AttributePath[];
        },
    ): Promise<ServerSubscription> {
        let session = overrides?.session;
        if (session === undefined) {
            const fabric = await node.addFabric();
            session = (await node.createExchange({ fabric })).session as NodeSession;
        }

        return new ServerSubscription({
            id: 1,
            context: {
                session,
                // node is only accessed when attributeRequests / eventRequests are set; we use neither
                node: node as any,
                initiateExchange: makeExchange,
            },
            request: {
                minIntervalFloorSeconds: overrides?.minIntervalFloorSeconds ?? 0,
                maxIntervalCeilingSeconds: overrides?.maxIntervalCeilingSeconds ?? 60,
                // Without attributeRequests / eventRequests these are keepalive-only sends
                attributeRequests: overrides?.attributeRequests,
                isFabricFiltered: false,
            },
            subscriptionOptions: ServerSubscriptionConfig.of(),
            // Use fixed short intervals so tests don't depend on randomization, unless a test wants the
            // real #determineSendingIntervals negotiation exercised.
            ...(overrides?.negotiateIntervals ? {} : { useAsMaxInterval: Millis(200), useAsSendInterval: Millis(100) }),
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

    it("keeps negotiated maxInterval >= minIntervalFloor when floor exceeds the 60-min publisher limit", async () => {
        // Spec §8.5.3.2: MinIntervalFloor <= MaxInterval. A floor above MAX_INTERVAL_PUBLISHER_LIMIT
        // (60 min) must not be capped below the floor.
        const node = await MockServerNode.createOnline();

        const floorSeconds = 65535; // uint16 max, ~18.2 h
        const subscription = await createSubscription(node, () => ({}) as any, {
            minIntervalFloorSeconds: floorSeconds,
            maxIntervalCeilingSeconds: floorSeconds,
            negotiateIntervals: true,
        });

        expect(subscription.maxInterval).to.be.at.least(Seconds(floorSeconds));

        await MockTime.resolve(node.close());
    });

    it("grants LIT ICD publisher maxInterval === idleModeDuration when the client requests a higher ceiling", async () => {
        const node = await MockServerNode.createOnline({ type: RootWithLitIcd, icdManagement: LIT_CONFIG });

        const subscription = await createSubscription(node, () => ({}) as any, {
            minIntervalFloorSeconds: 0,
            maxIntervalCeilingSeconds: 7200, // above idleModeDuration (3600 s)
            negotiateIntervals: true,
        });

        expect(subscription.maxInterval).equals(Seconds(LIT_CONFIG.idleModeDuration));

        await MockTime.resolve(node.close());
    });

    it("grants LIT ICD publisher maxInterval === idleModeDuration when the client requests a lower ceiling", async () => {
        const node = await MockServerNode.createOnline({ type: RootWithLitIcd, icdManagement: LIT_CONFIG });

        const subscription = await createSubscription(node, () => ({}) as any, {
            minIntervalFloorSeconds: 0,
            maxIntervalCeilingSeconds: 1800, // below idleModeDuration (3600 s)
            negotiateIntervals: true,
        });

        expect(subscription.maxInterval).equals(Seconds(LIT_CONFIG.idleModeDuration));

        await MockTime.resolve(node.close());
    });

    it("uses the generic (non-ICD) interval calculation for a non-ICD publisher", async () => {
        const node = await MockServerNode.createOnline();

        const subscription = await createSubscription(node, () => ({}) as any, {
            minIntervalFloorSeconds: 0,
            maxIntervalCeilingSeconds: 60,
            negotiateIntervals: true,
        });

        // Generic path: min(configured 3 min, ceiling 60 s) + up to 10 s randomization, never idleModeDuration.
        expect(subscription.maxInterval).to.be.at.least(Seconds(60));
        expect(subscription.maxInterval).to.be.below(Seconds(70));

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

    it("abandons the subscription after repeated MRP exhaustion, leaving the session alone", async () => {
        const node = await MockServerNode.createOnline();

        let sends = 0;
        const subscription = await createSubscription(node, () => {
            return {
                maxPayloadSize: 1200,
                async send() {
                    sends++;
                    // What MRP exhaustion actually throws — see MessageExchange #sentMessageAckFailure
                    throw new PeerUnresponsiveError(Millis(1000));
                },
                async close() {},
            } as unknown as MessageExchange;
        });

        const session = subscription.session as NodeSession;
        subscription.activate();

        await MockTime.advance(1000);
        for (let i = 0; i < 5; i++) {
            await MockTime.yield3();
        }

        expect(sends).equals(3); // #sendUpdateErrorCounter tolerates 2 failures before giving up

        // The update loop must terminate.  Abandoning from inside it cannot wait for it to finish -- that would be
        // waiting for its own caller -- and a lingering "updating" span means it never returned.
        expect(activeSpanNames(session.activate())).not.to.include("updating");
        expect([...session.subscriptions]).is.empty;

        // Failing to push reports says nothing about whether the controller can still reach us
        expect(session.isClosing).is.false;
        expect(session.isPeerLost).is.false;

        await MockTime.resolve(node.close());
    });

    it("completes a flushing close triggered from inside an in-flight update", async () => {
        const node = await MockServerNode.createOnline();
        const fabric = await node.addFabric();
        const initialExchange = await node.createExchange({ fabric });
        const session = initialExchange.session as NodeSession;

        const changedPath = {
            endpointId: EndpointNumber(0),
            clusterId: ClusterId(BasicInformation.id),
            attributeId: AttributeId(BasicInformation.attributes.dataModelRevision.id),
        };
        const emitChange = (version: number) =>
            node.protocol.attrsChanged.emit(
                changedPath.endpointId,
                changedPath.clusterId,
                [changedPath.attributeId],
                version,
            );

        let flushingClose: Promise<number> | undefined;

        // The message counter rollover callback runs on the stack of the send that consumed the counter, and closes
        // the session's subscriptions with a flush
        const reportExchange = new ProtocolMocks.Exchange({ index: 2, context: { session }, maxPayloadSize: 1200 });
        reportExchange.send = async () => {
            // A change arriving mid-send leaves outstanding data, so the close below reaches #flush
            emitChange(2);
            flushingClose = session.closeSubscriptions(true, reportExchange);
            await flushingClose;
            throw new PeerUnresponsiveError(Millis(1000));
        };

        const subscription = await createSubscription(node, () => reportExchange, {
            session,
            attributeRequests: [changedPath],
        });

        await initialExchange.writeStatus();
        await MockTime.resolve(
            subscription.sendInitialReport(new InteractionServerMessenger(initialExchange), {
                node,
                exchange: initialExchange,
                fabricFiltered: false,
            }),
        );
        subscription.activate();

        emitChange(1);
        await MockTime.advance(200);

        expect(flushingClose).is.not.undefined;
        await MockTime.resolve(flushingClose!);

        expect([...session.subscriptions]).is.empty;

        await MockTime.resolve(node.close());
    });

    it("completes session force-close triggered from inside an in-flight update", async () => {
        const node = await MockServerNode.createOnline();

        let subscription!: ServerSubscription;
        let forceClose: Promise<void> | undefined;

        // Mirrors MessageExchange.send(): the failing send reports the failure while still on the sending stack, and
        // the resulting teardown closes this subscription while its update is in flight
        const reportExchange = {
            maxPayloadSize: 1200,
            async send() {
                forceClose = (subscription.session as NodeSession).handlePeerLoss({
                    cause: new NoResponseTimeoutError("Simulated missing ack"),
                    currentExchange: reportExchange,
                });
                await forceClose;
                throw new NoResponseTimeoutError("Simulated missing ack");
            },
            async close() {},
        } as unknown as MessageExchange;

        subscription = await createSubscription(node, () => reportExchange);

        const session = subscription.session as NodeSession;
        subscription.activate();

        // Fire the 100 ms send timer + 50 ms delay timer so the keepalive update starts
        await MockTime.advance(200);

        expect(forceClose).is.not.undefined;
        await MockTime.resolve(forceClose!);

        expect(session.isClosing).is.true;
        expect([...session.subscriptions]).is.empty;

        await MockTime.resolve(node.close());
    });

    it("suppresses peer loss on the exchanges it opens to push subscription reports", async () => {
        const node = await MockServerNode.createOnline();
        const fabric = await node.addFabric();
        const session = (await node.createExchange({ fabric })).session as NodeSession;

        const exchangeManager = node.env.get(ExchangeManager);
        const captured = new Array<MessageExchange.Options | undefined>();
        exchangeManager.initiateExchangeForSession = (_session, _protocolId, options) => {
            captured.push(options);
            throw new PeerUnresponsiveError(Millis(1000));
        };

        const interactionServer = new InteractionServer(node, node.env.get(SessionManager));

        try {
            await expect(
                interactionServer.establishFormerSubscription(
                    {
                        subscriptionId: 1,
                        peerAddress: session.peerAddress,
                        isFabricFiltered: false,
                        minIntervalFloor: Seconds(0),
                        maxIntervalCeiling: Seconds(60),
                        maxInterval: Seconds(60),
                        sendInterval: Seconds(30),
                    },
                    session,
                ),
            ).to.be.rejectedWith(PeerUnresponsiveError);
        } finally {
            delete (exchangeManager as Partial<ExchangeManager>).initiateExchangeForSession;
        }

        expect(captured).has.length(1);
        expect(captured[0]?.suppressPeerLoss).is.true;

        await MockTime.resolve(node.close());
    });
});
