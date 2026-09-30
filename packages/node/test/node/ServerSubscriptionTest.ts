/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdManagementServer } from "#behaviors/icd-management";
import { InteractionServer } from "#node/server/InteractionServer.js";
import { ServerSubscription, ServerSubscriptionConfig } from "#node/server/ServerSubscription.js";
import {
    createPromise,
    DataReadQueue,
    Duration,
    Lifetime,
    Millis,
    NoResponseTimeoutError,
    Seconds,
    Time,
} from "@matter/general";
import { Specification } from "@matter/model";
import {
    ExchangeManager,
    InteractionServerMessenger,
    MessageExchange,
    NodeSession,
    PeerUnresponsiveError,
    ProtocolMocks,
    SessionManager,
} from "@matter/protocol";
import { AttributeId, AttributePath, ClusterId, EndpointNumber, EventPath } from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";
import { IcdManagement } from "@matter/types/clusters/icd-management";
import { LIT_CONFIG } from "./icd-helpers.js";
import { MockServerNode } from "./mock-server-node.js";
import { interaction } from "./node-helpers.js";

function activeSpanNames(lifetime: Lifetime): string[] {
    const names = new Array<string>();
    for (const span of lifetime.spans) {
        names.push(String(span.name), ...activeSpanNames(span));
    }
    return names;
}

const RootWithLitIcd = MockServerNode.RootEndpoint.with(
    IcdManagementServer.with(
        IcdManagement.Feature.CheckInProtocolSupport,
        IcdManagement.Feature.LongIdleTimeSupport,
        IcdManagement.Feature.UserActiveModeTrigger,
    ),
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
            eventRequests?: EventPath[];
            maxInterval?: Duration;
            sendInterval?: Duration;
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
                eventRequests: overrides?.eventRequests,
                isFabricFiltered: false,
            },
            subscriptionOptions: ServerSubscriptionConfig.of(),
            // Use fixed short intervals so tests don't depend on randomization, unless a test wants the
            // real #determineSendingIntervals negotiation exercised.
            ...(overrides?.negotiateIntervals
                ? {}
                : {
                      useAsMaxInterval: overrides?.maxInterval ?? Millis(200),
                      useAsSendInterval: overrides?.sendInterval ?? Millis(100),
                  }),
        });
    }

    it("marks the subscription terminated and removes it from the session when the peer cancels", async () => {
        const node = await MockServerNode.createOnline();

        const subscription = await createSubscription(node, () => ({}) as any);
        const session = subscription.session as NodeSession;

        subscription.activate();

        expect(subscription.isTerminated).is.false;
        expect([...session.subscriptions]).has.length(1);

        await subscription.handlePeerCancel();

        expect(subscription.isTerminated).is.true;
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
        expect(subscription.isTerminated).is.true;
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

    it("holds a report queued behind a report being sent until its deferral ends", async () => {
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

        // Each report opens an exchange; the first is acknowledged only once the test releases it
        const sends = new Array<number>();
        const releaseFirst = new DataReadQueue<void>();
        const firstDone = createPromise<void>();
        const subscription = await createSubscription(
            node,
            () => {
                sends.push(Time.nowMs);
                const isFirst = sends.length === 1;
                const exchange = new ProtocolMocks.Exchange({
                    index: sends.length + 1,
                    context: { session },
                    maxPayloadSize: 1200,
                });
                exchange.send = async () => {
                    if (isFirst) {
                        await releaseFirst.read();
                    }
                    await exchange.writeStatus();
                };
                exchange.close = async () => {
                    if (isFirst) {
                        firstDone.resolver();
                    }
                };
                return exchange;
            },
            { session, attributeRequests: [changedPath], negotiateIntervals: true },
        );

        await initialExchange.writeStatus();
        await MockTime.resolve(
            subscription.sendInitialReport(new InteractionServerMessenger(initialExchange), {
                node,
                exchange: initialExchange,
                fabricFiltered: false,
            }),
        );
        subscription.activate();

        emitChange(2);
        await MockTime.advance(100);
        emitChange(3);
        await MockTime.advance(100);
        expect(sends).length(1);

        const deferredAt = Time.nowMs;
        subscription.deferReports(Millis(5000));
        releaseFirst.write();
        await MockTime.resolve(firstDone.promise);
        await MockTime.yield3();
        await MockTime.advance(100);
        expect(sends).length(1);

        await MockTime.advance(deferredAt + 5000 + 100 - Time.nowMs);
        expect(sends).length(2);
        expect(sends[1] - deferredAt).at.least(5000);
        await MockTime.advance(1000);
        expect(sends).length(2);

        await MockTime.resolve(node.close());
    });

    it("sends the keep-alive queued behind a slow report within the send interval despite a deferral", async () => {
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

        // The first two reports are acknowledged only once the test releases each of them
        const sends = new Array<number>();
        const releases = [new DataReadQueue<void>(), new DataReadQueue<void>()];
        const done = [createPromise<void>(), createPromise<void>()];
        const subscription = await createSubscription(
            node,
            () => {
                const index = sends.length;
                sends.push(Time.nowMs);
                const exchange = new ProtocolMocks.Exchange({
                    index: index + 2,
                    context: { session },
                    maxPayloadSize: 1200,
                });
                exchange.send = async () => {
                    await releases[index]?.read();
                    await exchange.writeStatus();
                };
                exchange.close = async () => {
                    done[index]?.resolver();
                };
                return exchange;
            },
            { session, attributeRequests: [changedPath], maxInterval: Seconds(10), sendInterval: Seconds(8) },
        );

        await initialExchange.writeStatus();
        await MockTime.resolve(
            subscription.sendInitialReport(new InteractionServerMessenger(initialExchange), {
                node,
                exchange: initialExchange,
                fabricFiltered: false,
            }),
        );
        subscription.activate();
        const start = Time.nowMs;
        const at = (ms: number) => MockTime.advance(start + ms - Time.nowMs);

        // Report A goes out and stays in flight; a change at 1 s queues report B behind it
        emitChange(2);
        await at(1000);
        emitChange(3);
        await at(1100);
        expect(sends).length(1);

        // A completes at 5 s, so B goes out and stays in flight
        await at(5000);
        releases[0].write();
        await MockTime.resolve(done[0].promise);
        await MockTime.yield3();
        expect(sends).length(2);
        const bSentAt = sends[1];

        // The send interval queues a keep-alive behind B, then an invoke defers reports
        await at(9200);
        subscription.deferReports(Seconds(10));

        // B completes at 9.5 s; the queued keep-alive must still go out within the send interval after B
        await at(9500);
        releases[1].write();
        await MockTime.resolve(done[1].promise);
        await MockTime.yield3();
        await MockTime.advance(bSentAt + Seconds(8) + 1 - Time.nowMs);
        expect(sends).length(3);
        expect(sends[2] - bSentAt).at.most(Seconds(8));

        await MockTime.resolve(node.close());
    });

    /**
     * A subscription to one attribute whose reports, by index in `held`, are acknowledged only once the test
     * releases them.  `sends` records the time each report opens its exchange, `messages` the time each report
     * message is sent, both on the monotonic clock.
     */
    async function subscribeWithSlowReports(
        node: MockServerNode,
        options: {
            held?: number[];
            minIntervalFloorSeconds?: number;
            maxInterval: Duration;
            sendInterval: Duration;
            beforeInitialReport?: () => void;
            beforeActivate?: () => void;
        },
    ) {
        const fabric = await node.addFabric();
        const initialExchange = await node.createExchange({ fabric });
        const session = initialExchange.session as NodeSession;

        const changedPath = {
            endpointId: EndpointNumber(0),
            clusterId: ClusterId(BasicInformation.id),
            attributeId: AttributeId(BasicInformation.attributes.dataModelRevision.id),
        };
        let version = 1;
        const emitChange = () =>
            node.protocol.attrsChanged.emit(
                changedPath.endpointId,
                changedPath.clusterId,
                [changedPath.attributeId],
                ++version,
            );
        const emitUnselectedChange = () =>
            node.protocol.attrsChanged.emit(
                changedPath.endpointId,
                changedPath.clusterId,
                [AttributeId(BasicInformation.attributes.nodeLabel.id)],
                ++version,
            );

        const sends = new Array<number>();
        const messages = new Array<number>();
        const releases = new Map((options.held ?? []).map(index => [index, new DataReadQueue<void>()]));
        const done = new Array<Promise<void>>();
        const subscription = await createSubscription(
            node,
            () => {
                const index = sends.length;
                sends.push(Time.nowUs);
                const completion = createPromise<void>();
                done.push(completion.promise);
                const exchange = new ProtocolMocks.Exchange({
                    index: index + 2,
                    context: { session },
                    maxPayloadSize: 1200,
                });
                exchange.send = async () => {
                    messages.push(Time.nowUs);
                    await releases.get(index)?.read();
                    await exchange.writeStatus();
                };
                exchange.close = async () => {
                    completion.resolver();
                };
                return exchange;
            },
            {
                session,
                attributeRequests: [changedPath],
                minIntervalFloorSeconds: options.minIntervalFloorSeconds,
                maxInterval: options.maxInterval,
                sendInterval: options.sendInterval,
            },
        );

        await initialExchange.writeStatus();
        options.beforeInitialReport?.();
        await MockTime.resolve(
            subscription.sendInitialReport(new InteractionServerMessenger(initialExchange), {
                node,
                exchange: initialExchange,
                fabricFiltered: false,
            }),
        );
        options.beforeActivate?.();
        subscription.activate();
        const start = Time.nowUs;

        // A report's message goes out only after its payload iteration has had its turns, so advance in small steps
        async function at(ms: number) {
            while (Time.nowUs < start + ms) {
                await MockTime.advance(Math.min(10, start + ms - Time.nowUs));
                await MockTime.yield3();
            }
        }

        async function completed(index: number) {
            await MockTime.resolve(done[index]);
            await MockTime.yield3();
        }

        return {
            subscription,
            sends,
            messages,
            emitChange,
            emitUnselectedChange,
            at,
            completed,
            async release(index: number) {
                releases.get(index)?.write();
                await completed(index);
            },
        };
    }

    describe("with a slow report in flight", () => {
        const intervals = { maxInterval: Seconds(10), sendInterval: Seconds(8) };

        /**
         * Report A is in flight from 0 s to 5 s; a change at 1 s queues report B, which goes out at 5 s.  The send
         * interval restarted by that change ends at 9 s.
         */
        async function reportQueuedBehindSlowReport(node: MockServerNode, held = [0, 1]) {
            const reports = await subscribeWithSlowReports(node, { held, ...intervals });
            reports.emitChange();
            await reports.at(1000);
            reports.emitChange();
            await reports.at(1100);
            expect(reports.sends).length(1);

            await reports.at(5000);
            await reports.release(0);
            expect(reports.sends).length(2);
            return reports;
        }

        it("sends the keep-alive that fell due while a report was in flight when that report completes", async () => {
            const node = await MockServerNode.createOnline();
            const { sends, at, release } = await reportQueuedBehindSlowReport(node);
            const bSentAt = sends[1];

            await at(9500);
            expect(sends).length(2);
            await release(1);
            await at(20_000);
            expect(sends.length).at.least(3);
            expect(sends[2] - bSentAt).at.most(Seconds(8));

            await MockTime.resolve(node.close());
        });

        // Characterization: passes without the owed keep-alive too; guards against sending an empty report
        // whenever a pass is queued behind a report
        it("sends nothing for a queued pass with only unselected changes when no keep-alive is owed", async () => {
            const node = await MockServerNode.createOnline();
            const { messages, emitChange, emitUnselectedChange, at, release } = await subscribeWithSlowReports(node, {
                held: [0],
                ...intervals,
            });

            emitChange();
            await at(1000);
            emitUnselectedChange();
            await at(5000);
            await release(0);
            await at(5500);
            expect(messages).length(1);

            await MockTime.resolve(node.close());
        });

        it("sends nothing for a later queued pass with only unselected changes once the owed keep-alive went out", async () => {
            const node = await MockServerNode.createOnline();
            const { messages, emitChange, emitUnselectedChange, at, release } = await reportQueuedBehindSlowReport(
                node,
                [0, 1, 3],
            );

            await at(9500);
            await release(1);
            await at(9600);
            expect(messages).length(3);

            // Report D is in flight from 10 s; a change it does not select queues a pass behind it
            emitChange();
            await at(10_200);
            expect(messages).length(4);
            emitUnselectedChange();
            await at(11_000);
            await release(3);
            await at(11_500);
            expect(messages).length(4);

            await MockTime.resolve(node.close());
        });

        // Characterization: passes without the owed keep-alive too; guards against sending it on a closed subscription
        it("does not send the keep-alive that fell due while a report was in flight once closed", async () => {
            const node = await MockServerNode.createOnline();
            const { subscription, sends, at, release } = await reportQueuedBehindSlowReport(node);

            await at(9200);
            const closing = subscription.close();
            await release(1);
            await MockTime.resolve(closing);
            await MockTime.advance(1000);
            expect(sends).length(2);

            await MockTime.resolve(node.close());
        });
    });

    describe("after a wall clock step", () => {
        const intervals = { minIntervalFloorSeconds: 2, maxInterval: Seconds(10), sendInterval: Seconds(8) };

        // GeneralDiagnostics fails to take the node offline after a backward step longer than the node's uptime, so
        // each test undoes its steps before closing the node
        let stepped = 0;
        beforeEach(() => (stepped = 0));
        const stepWallClock = (ms: number) => {
            stepped += ms;
            MockTime.stepWallClock(ms);
        };
        const closeNode = async (node: MockServerNode) => {
            MockTime.stepWallClock(-stepped);
            stepped = 0;
            await MockTime.resolve(node.close());
        };

        it("sends a change held by the min interval floor when the floor ends although the wall clock stepped backwards", async () => {
            const node = await MockServerNode.createOnline();
            const { sends, emitChange, at } = await subscribeWithSlowReports(node, intervals);

            await at(500);
            emitChange();
            stepWallClock(-60_000);

            await at(1900);
            expect(sends).length(0);
            await at(2100);
            expect(sends).length(1);

            await closeNode(node);
        });

        it("sends the keep-alive at the send interval although the wall clock stepped backwards", async () => {
            const node = await MockServerNode.createOnline();
            const { sends, at } = await subscribeWithSlowReports(node, intervals);

            await at(1000);
            stepWallClock(-60_000);

            await at(7900);
            expect(sends).length(0);
            await at(8100);
            expect(sends).length(1);

            await closeNode(node);
        });

        it("sends a change held by a deferral when the deferral ends although the wall clock stepped backwards", async () => {
            const node = await MockServerNode.createOnline();
            const { subscription, sends, emitChange, at } = await subscribeWithSlowReports(node, intervals);

            subscription.deferReports(Seconds(3));
            stepWallClock(-60_000);
            emitChange();

            await at(2900);
            expect(sends).length(0);
            await at(3100);
            expect(sends).length(1);

            await closeNode(node);
        });

        it("holds a change inside the min interval floor after the wall clock stepped forwards", async () => {
            const node = await MockServerNode.createOnline();
            const { sends, emitChange, at } = await subscribeWithSlowReports(node, intervals);

            await at(300);
            stepWallClock(60_000);
            await at(500);
            emitChange();

            await at(1900);
            expect(sends).length(0);
            await at(2100);
            expect(sends).length(1);

            await closeNode(node);
        });

        it("holds a change until its deferral ends after the wall clock stepped forwards", async () => {
            const node = await MockServerNode.createOnline();
            const { subscription, sends, emitChange, at } = await subscribeWithSlowReports(node, intervals);

            await at(1000);
            subscription.deferReports(Seconds(5));
            await at(1500);
            stepWallClock(60_000);
            await at(2000);
            emitChange();

            await at(5900);
            expect(sends).length(0);
            await at(6100);
            expect(sends).length(1);

            await closeNode(node);
        });

        it("holds a report queued behind a report being sent until its deferral ends after the wall clock stepped forwards", async () => {
            const node = await MockServerNode.createOnline();
            const { subscription, sends, emitChange, at, release } = await subscribeWithSlowReports(node, {
                held: [0],
                maxInterval: Seconds(10),
                sendInterval: Seconds(8),
            });

            emitChange();
            await at(500);
            emitChange();
            await at(1000);
            subscription.deferReports(Seconds(5));
            stepWallClock(60_000);

            await at(2000);
            await release(0);
            await MockTime.advance(100);
            expect(sends).length(1);
            await at(6100);
            expect(sends).length(2);

            await closeNode(node);
        });

        it("keeps the deferral bound set at activation when the wall clock stepped backwards before it", async () => {
            const node = await MockServerNode.createOnline();
            const { subscription, sends, emitChange, at } = await subscribeWithSlowReports(node, {
                maxInterval: Seconds(10),
                sendInterval: Seconds(8),
                beforeActivate: () => stepWallClock(-60_000),
            });

            subscription.deferReports(Seconds(3));
            emitChange();
            await at(2900);
            expect(sends).length(0);
            await at(3100);
            expect(sends).length(1);

            await closeNode(node);
        });

        it("sends a change at the end of a deferral requested after the wall clock stepped backwards", async () => {
            const node = await MockServerNode.createOnline();
            const { subscription, sends, emitChange, at } = await subscribeWithSlowReports(node, intervals);

            stepWallClock(-60_000);
            subscription.deferReports(Seconds(3));
            emitChange();

            await at(2900);
            expect(sends).length(0);
            await at(3100);
            expect(sends).length(1);

            await closeNode(node);
        });

        // Characterization, this test and the next: both also pass when every computation reads the wall clock; each
        // guards one computation against reading a different clock than the others
        it("keeps the keep-alive on time after a report sent after the wall clock stepped forwards", async () => {
            const node = await MockServerNode.createOnline();
            const { sends, messages, emitChange, at, completed } = await subscribeWithSlowReports(node, intervals);

            await at(500);
            emitChange();
            stepWallClock(60_000);
            await at(2100);
            expect(sends).length(1);
            await completed(0);

            await MockTime.advance(messages[0] + Seconds(8) + 1 - Time.nowUs);
            expect(sends).length(2);

            await closeNode(node);
        });

        it("keeps the min interval floor after the initial report when the wall clock stepped forwards before it", async () => {
            const node = await MockServerNode.createOnline();
            const { sends, emitChange, at } = await subscribeWithSlowReports(node, {
                ...intervals,
                beforeInitialReport: () => stepWallClock(60_000),
            });

            await at(500);
            emitChange();
            await at(1900);
            expect(sends).length(0);
            await at(2100);
            expect(sends).length(1);

            await closeNode(node);
        });
    });

    it("flushes a report queued behind a report being sent on close despite a deferral", async () => {
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

        // Each report opens an exchange; the first is acknowledged only once the test releases it
        const sends = new Array<number>();
        const releaseFirst = new DataReadQueue<void>();
        const firstDone = createPromise<void>();
        const subscription = await createSubscription(
            node,
            () => {
                sends.push(Time.nowMs);
                const isFirst = sends.length === 1;
                const exchange = new ProtocolMocks.Exchange({
                    index: sends.length + 1,
                    context: { session },
                    maxPayloadSize: 1200,
                });
                exchange.send = async () => {
                    if (isFirst) {
                        await releaseFirst.read();
                    }
                    await exchange.writeStatus();
                };
                exchange.close = async () => {
                    if (isFirst) {
                        firstDone.resolver();
                    }
                };
                return exchange;
            },
            { session, attributeRequests: [changedPath], negotiateIntervals: true },
        );

        await initialExchange.writeStatus();
        await MockTime.resolve(
            subscription.sendInitialReport(new InteractionServerMessenger(initialExchange), {
                node,
                exchange: initialExchange,
                fabricFiltered: false,
            }),
        );
        subscription.activate();

        emitChange(2);
        await MockTime.advance(100);
        emitChange(3);
        await MockTime.advance(100);
        expect(sends).length(1);

        subscription.deferReports(Millis(5000));
        const closing = subscription.close(session);
        releaseFirst.write();
        await MockTime.resolve(closing);
        expect(sends).length(2);

        await MockTime.resolve(node.close());
    });

    it("selects endpoints by its event paths when it has no attribute paths", async () => {
        const node = await MockServerNode.createOnline();

        const subscription = await createSubscription(node, () => ({}) as any, {
            eventRequests: [{ endpointId: EndpointNumber(0), clusterId: ClusterId(BasicInformation.id) }],
        });

        expect(subscription.selectsAnyEndpoint(new Set([EndpointNumber(1)]))).equals(false);
        expect(subscription.selectsAnyEndpoint(new Set([EndpointNumber(0)]))).equals(true);

        await MockTime.resolve(node.close());
    });

    it("reports only the changed attribute when several attributes of one cluster are subscribed", async () => {
        const node = await MockServerNode.createOnline();
        const fabric = await node.addFabric();

        const nodeLabelPath = {
            endpointId: EndpointNumber(0),
            clusterId: ClusterId(BasicInformation.id),
            attributeId: AttributeId(BasicInformation.attributes.nodeLabel.id),
        };
        const locationPath = {
            endpointId: EndpointNumber(0),
            clusterId: ClusterId(BasicInformation.id),
            attributeId: AttributeId(BasicInformation.attributes.location.id),
        };

        await interaction.subscribe(node, fabric, {
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            isFabricFiltered: false,
            attributeRequests: [nodeLabelPath, locationPath],
            keepSubscriptions: true,
            minIntervalFloorSeconds: 0,
            maxIntervalCeilingSeconds: 2,
        });

        const reported = interaction.receiveData(node, 1, 0);

        await MockTime.resolve(node.set({ basicInformation: { nodeLabel: "relabeled" } }));

        const report = await MockTime.resolve(reported);

        expect(report.attributes.map(({ attributeData }) => attributeData?.path)).deep.equals([nodeLabelPath]);

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
