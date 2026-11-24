/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientSubscriptionHandler } from "#action/client/subscription/ClientSubscriptionHandler.js";
import { ClientSubscriptions } from "#action/client/subscription/ClientSubscriptions.js";
import { PeerSubscription } from "#action/client/subscription/PeerSubscription.js";
import { Subscribe } from "#action/request/Subscribe.js";
import { ReadResult } from "#action/response/ReadResult.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { MessageType } from "#interaction/InteractionMessenger.js";
import { PeerAckMissingError, PeerUnresponsiveError } from "#peer/PeerCommunicationError.js";
import type { ExchangeReceiveOptions, MessageExchange } from "#protocol/MessageExchange.js";
import type { NodeSession } from "#session/NodeSession.js";
import { SessionManager } from "#session/SessionManager.js";
import { SessionParameters } from "#session/SessionParameters.js";
import {
    createPromise,
    DataReadQueue,
    ImplementationError,
    Lifetime,
    MemoryStorageDriver,
    Seconds,
    StandardCrypto,
    StorageContext,
} from "@matter/general";
import { Specification } from "@matter/model";
import {
    AttributeId,
    ClusterId,
    DataReport,
    EndpointNumber,
    EventId,
    EventNumber,
    NodeId,
    Status,
    TlvDataReport,
    TlvOfModel,
    TlvStatusResponse,
    TlvUInt16,
} from "@matter/types";
import { BasicInformation } from "@matter/types/clusters/basic-information";

const SUBSCRIPTION_ID = 1;

async function aSession(): Promise<NodeSession> {
    const storage = new MemoryStorageDriver();
    storage.initialize();

    const sessions = new SessionManager({
        parameters: SessionParameters.defaults,
        fabrics: new FabricManager(new StandardCrypto()),
        storage: new StorageContext(storage, ["sessions"]),
    });
    await sessions.construction.ready;

    return sessions.createSecureSession({
        id: 100,
        fabric: undefined,
        peerNodeId: NodeId(1),
        peerSessionId: 0x8d4b,
        sharedSecret: new Uint8Array(),
        salt: new Uint8Array(),
        isInitiator: false,
        isResumption: false,
    });
}

/**
 * An exchange that delivers a keepalive report, in two chunks when {@link chunked}, and settles each StatusResponse we
 * send with {@link statusSent}.
 */
function keepaliveExchange(session: NodeSession, statusSent: () => Promise<void>, chunked: boolean) {
    const queue = new DataReadQueue<any>();
    const chunk = (moreChunkedMessages: boolean) =>
        queue.write({
            packetHeader: {},
            payloadHeader: { messageType: MessageType.ReportData },
            payload: TlvDataReport.encode({
                interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                subscriptionId: SUBSCRIPTION_ID,
                suppressResponse: false,
                moreChunkedMessages,
            }),
        });
    if (chunked) {
        chunk(true);
    }
    chunk(false);

    return {
        maxPayloadSize: 1200,
        via: "test",
        channel: { session },
        send: (messageType: number) => (messageType === MessageType.StatusResponse ? statusSent() : undefined),
        nextMessage: () => queue.read(),
        close: async () => {},
    } as unknown as MessageExchange;
}

async function receiveKeepalive(
    statusSent: (subscriptions: ClientSubscriptions) => Promise<void>,
    { chunked = false, compactPriming = true } = {},
) {
    const session = await aSession();
    const subscriptions = new ClientSubscriptions(Lifetime("test client subscriptions"));
    const subscription = new PeerSubscription({
        request: Subscribe({}),
        peer: session.peerAddress,
        closed: () => subscriptions.delete(subscription),
        lifetime: subscriptions,
        response: {
            subscriptionId: SUBSCRIPTION_ID,
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
            maxInterval: 300,
        },
        maxPeerResponseTime: Seconds(10),
        compactPriming,
    });
    subscriptions.addPeer(subscription);

    const exchange = keepaliveExchange(session, () => statusSent(subscriptions), chunked);
    const error = await new ClientSubscriptionHandler(subscriptions).onNewExchange(exchange).then(
        () => undefined,
        (error: unknown) => error,
    );

    const { isClosed } = subscription;
    await subscriptions.close();
    return { isClosed, error };
}

const ackMissing = () => Promise.reject(new PeerAckMissingError(Seconds(60)));

describe("ClientSubscriptionHandler", () => {
    beforeEach(() => MockTime.reset());

    describe("report observation", () => {
        async function fixture(reports: DataReport[], known = true, consume = true) {
            const session = await aSession();
            const subscriptions = new ClientSubscriptions(Lifetime("observed client subscriptions"));
            const observations = new Array<ClientSubscriptions.Report>();
            const values = new Array<ReadResult.Report>();
            const statuses = new Array<Status>();
            const waitingForNextMessage = createPromise<void>();
            let reads = 0;
            let keepalives = 0;
            let started = 0;
            let closed = 0;
            const request = Subscribe({});
            request.keepaliveReceived = () => {
                keepalives++;
            };
            request.updated = async chunks => {
                for await (const chunk of chunks) {
                    if (!consume) {
                        continue;
                    }
                    for await (const report of chunk) {
                        values.push(report);
                    }
                }
            };
            const subscription = new PeerSubscription({
                request,
                peer: session.peerAddress,
                closed: () => subscriptions.delete(subscription),
                lifetime: subscriptions,
                response: {
                    subscriptionId: SUBSCRIPTION_ID,
                    interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
                    maxInterval: 300,
                },
                maxPeerResponseTime: Seconds(10),
            });
            if (known) {
                subscriptions.addPeer(subscription);
            }
            subscriptions.reportStarted.on(() => {
                started++;
            });
            const observe = (observation: ClientSubscriptions.Report) => {
                observations.push(observation);
            };
            subscriptions.reportReceived.on(observe);
            const queue = new DataReadQueue<any>();
            for (const report of reports) {
                queue.write({
                    packetHeader: {},
                    payloadHeader: { messageType: MessageType.ReportData },
                    payload: TlvDataReport.encode(report),
                });
            }
            const exchange = {
                maxPayloadSize: 1200,
                via: "observation test",
                channel: { session },
                send: async (messageType: number, payload: Uint8Array) => {
                    expect(messageType).equal(MessageType.StatusResponse);
                    statuses.push(TlvStatusResponse.decode(payload).status);
                },
                nextMessage: (options?: ExchangeReceiveOptions) => {
                    if (reads++ > 0) {
                        waitingForNextMessage.resolver();
                    }
                    return queue.read(options?.abort);
                },
                close: async () => {
                    closed++;
                },
            } as unknown as MessageExchange;
            return {
                session,
                subscriptions,
                subscription,
                observations,
                observe,
                values,
                statuses,
                waitingForNextMessage: waitingForNextMessage.promise,
                counts: () => ({ keepalives, started, closed }),
                receive: () => new ClientSubscriptionHandler(subscriptions).onNewExchange(exchange),
                async close() {
                    subscription.close();
                    await subscriptions.close();
                },
            };
        }

        const emptyReport = (subscriptionId: number | undefined = SUBSCRIPTION_ID): DataReport => ({
            subscriptionId,
            interactionModelRevision: Specification.INTERACTION_MODEL_REVISION,
        });
        const valueReport = (subscriptionId = SUBSCRIPTION_ID, moreChunkedMessages = false): DataReport => ({
            ...emptyReport(subscriptionId),
            moreChunkedMessages,
            attributeReports: [
                {
                    attributeData: {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(0x0400),
                            attributeId: AttributeId(0),
                        },
                        dataVersion: 1,
                        data: TlvUInt16.encodeTlv(123),
                    },
                },
            ],
        });

        it("observes an unknown subscription before the unchanged rejection", async () => {
            const f = await fixture([emptyReport()], false);
            try {
                let statusesAtReceipt: Status[] | undefined;
                f.subscriptions.reportReceived.on(() => {
                    statusesAtReceipt = [...f.statuses];
                });
                await f.receive();
                expect(statusesAtReceipt).deep.equal([]);
                expect(f.observations).deep.equal([
                    {
                        kind: "message",
                        session: f.session,
                        subscriptionId: SUBSCRIPTION_ID,
                        subscription: undefined,
                        isInitial: true,
                        empty: true,
                        moreChunkedMessages: false,
                    },
                ]);
                expect(f.statuses).deep.equal([Status.InvalidSubscription]);
                expect(f.counts()).deep.equal({ keepalives: 0, started: 0, closed: 1 });
                expect(f.subscriptions.getPeer(f.session.peerAddress, SUBSCRIPTION_ID)).undefined;
            } finally {
                await f.close();
            }
        });

        it("observes one message per valid chunk and only values consumed by updated", async () => {
            const f = await fixture([valueReport(SUBSCRIPTION_ID, true), valueReport()]);
            try {
                await f.receive();
                expect(f.observations.map(report => report.kind)).deep.equal(["message", "value", "message", "value"]);
                expect(
                    f.observations
                        .filter(report => report.kind === "message")
                        .map(({ isInitial, empty }) => ({ isInitial, empty })),
                ).deep.equal([
                    { isInitial: true, empty: false },
                    { isInitial: false, empty: false },
                ]);
                for (const observation of f.observations) {
                    expect(observation.session).equal(f.session);
                    expect(observation.subscription).equal(f.subscription);
                    if (observation.kind === "value") {
                        expect(observation.report).equal(f.values.shift());
                        expect(observation.report.value).equal(123);
                    }
                }
                expect(f.statuses).deep.equal([Status.Success, Status.Success]);
                expect(f.subscription.isClosed).false;
                expect(f.counts().started).equal(1);
            } finally {
                await f.close();
            }
        });

        it("keeps empty reports on the existing keepalive callback", async () => {
            const f = await fixture([emptyReport()]);
            try {
                await f.receive();
                expect(f.observations.map(report => report.kind)).deep.equal(["message"]);
                expect(f.observations[0]).include({ empty: true, isInitial: true });
                expect(f.counts()).deep.equal({ keepalives: 1, started: 1, closed: 1 });
                expect(f.statuses).deep.equal([Status.Success]);
            } finally {
                await f.close();
            }
        });

        it("observes decoded event-only reports as nonempty", async () => {
            const report = emptyReport();
            report.eventReports = [
                {
                    eventData: {
                        path: { endpointId: EndpointNumber(0), clusterId: ClusterId(0x28), eventId: EventId(0) },
                        eventNumber: EventNumber(1),
                        priority: 1,
                        systemTimestamp: 1234,
                        data: TlvOfModel(BasicInformation.events.startUp).encodeTlv({ softwareVersion: 1 }),
                    },
                },
            ];
            const f = await fixture([report]);
            try {
                await f.receive();
                expect(f.observations.map(report => report.kind)).deep.equal(["message", "value"]);
                expect(f.observations[0]).include({ empty: false, isInitial: true });
                expect(f.values.map(report => report.kind)).deep.equal(["event-value"]);
                const observation = f.observations[1];
                expect(observation.kind).equal("value");
                if (observation.kind === "value") {
                    expect(observation.report).equal(f.values[0]);
                    expect(observation.report.value).deep.equal({ softwareVersion: 1 });
                }
                expect(f.counts().keepalives).equal(0);
                expect(f.statuses).deep.equal([Status.Success]);
            } finally {
                await f.close();
            }
        });

        it("does not attribute mismatched or missing chunk IDs to the subscription", async () => {
            for (const subscriptionId of [2, undefined]) {
                const invalid = emptyReport();
                invalid.subscriptionId = subscriptionId;
                const f = await fixture([valueReport(SUBSCRIPTION_ID, true), invalid]);
                try {
                    await f.receive();
                    expect(f.observations.map(report => report.kind)).deep.equal(["message", "value"]);
                    expect(f.statuses).deep.equal([Status.Success, Status.InvalidSubscription]);
                } finally {
                    await f.close();
                }
            }
        });

        it("does not decode values solely for observers", async () => {
            const f = await fixture([valueReport(SUBSCRIPTION_ID, true), valueReport()], true, false);
            try {
                await f.receive();
                expect(f.observations.map(report => report.kind)).deep.equal(["message", "message"]);
                expect(f.values).deep.equal([]);
                expect(f.statuses).deep.equal([Status.Success, Status.Success]);
            } finally {
                await f.close();
            }
        });

        it("identifies empty later chunks without counting another exchange or keepalive", async () => {
            const f = await fixture([valueReport(SUBSCRIPTION_ID, true), emptyReport()]);
            try {
                await f.receive();
                expect(f.observations.map(report => report.kind)).deep.equal(["message", "value", "message"]);
                expect(f.observations[2]).include({ empty: true, isInitial: false });
                expect(f.counts().keepalives).equal(0);
                expect(f.statuses).deep.equal([Status.Success, Status.Success]);
            } finally {
                await f.close();
            }
        });

        it("counts status-only messages as nonempty without producing a value", async () => {
            const report = emptyReport();
            report.attributeReports = [
                {
                    attributeStatus: {
                        path: {
                            endpointId: EndpointNumber(1),
                            clusterId: ClusterId(0x0400),
                            attributeId: AttributeId(0),
                        },
                        status: { status: Status.UnsupportedAttribute },
                    },
                },
            ];
            const f = await fixture([report]);
            try {
                await f.receive();
                expect(f.observations.map(report => report.kind)).deep.equal(["message"]);
                expect(f.observations[0]).include({ empty: false, isInitial: true });
                expect(f.values.map(report => report.kind)).deep.equal(["attr-status"]);
                expect(f.counts().keepalives).equal(0);
            } finally {
                await f.close();
            }
        });

        it("drains messages without decoding when updated is undefined", async () => {
            const f = await fixture([valueReport(SUBSCRIPTION_ID, true), valueReport()]);
            f.subscription.request.updated = undefined;
            try {
                await f.receive();
                expect(f.observations.map(report => report.kind)).deep.equal(["message", "message"]);
                expect(f.values).deep.equal([]);
                expect(f.statuses).deep.equal([Status.Success, Status.Success]);
                expect(f.counts().closed).equal(1);
            } finally {
                await f.close();
            }
        });

        it("does not start observation midway through an unobserved exchange", async () => {
            const f = await fixture([valueReport(SUBSCRIPTION_ID, true), valueReport()]);
            f.subscriptions.reportReceived.off(f.observe);
            f.subscriptions.reportStarted.on(() => {
                f.subscriptions.reportReceived.on(f.observe);
            });
            try {
                await f.receive();
                expect(f.observations).deep.equal([]);
                expect(f.values).length(2);
                expect(f.statuses).deep.equal([Status.Success, Status.Success]);
            } finally {
                await f.close();
            }
        });

        it("aborts while waiting for a later chunk and drains the observed exchange", async () => {
            const f = await fixture([valueReport(SUBSCRIPTION_ID, true)]);
            try {
                const receiving = f.receive();
                await f.waitingForNextMessage;
                const blocked = f.subscriptions.blockNewActivity();
                await receiving;
                await blocked;
                expect(f.observations.map(report => report.kind)).deep.equal(["message", "value"]);
                expect(f.observations[0]).include({ isInitial: true, empty: false });
                expect(f.subscription.isReading).false;
                expect(f.statuses).deep.equal([Status.Success]);
                expect(f.counts().closed).equal(1);
            } finally {
                await f.close();
            }
        });

        it("contains throwing observers without changing status or delivery", async () => {
            for (const known of [true, false]) {
                const f = await fixture([valueReport()], known);
                try {
                    let reached = 0;
                    f.subscriptions.reportReceived.on(() => {
                        throw new ImplementationError("report observer failed");
                    });
                    f.subscriptions.reportReceived.on(() => {
                        reached++;
                    });
                    await f.receive();
                    expect(f.statuses).deep.equal([known ? Status.Success : Status.InvalidSubscription]);
                    expect(f.values).length(known ? 1 : 0);
                    expect(reached).equal(known ? 2 : 1);
                    expect(f.subscription.isClosed).false;
                } finally {
                    await f.close();
                }
            }
        });

        it("does not observe an initial report without a subscription ID", async () => {
            const report = emptyReport();
            report.subscriptionId = undefined;
            const f = await fixture([report]);
            try {
                await f.receive();
                expect(f.observations).deep.equal([]);
                expect(f.statuses).deep.equal([Status.InvalidSubscription]);
            } finally {
                await f.close();
            }
        });

        it("releases observers when the registry closes", async () => {
            const f = await fixture([emptyReport()]);
            await f.receive();
            await f.close();
            f.observations.length = 0;
            f.subscriptions.reportReceived.emit({
                kind: "message",
                session: f.session,
                subscription: undefined,
                subscriptionId: SUBSCRIPTION_ID,
                isInitial: true,
                empty: true,
                moreChunkedMessages: false,
            });
            expect(f.observations).deep.equal([]);
        });

        it("does not observe shutdown reports", async () => {
            const f = await fixture([emptyReport()]);
            try {
                await f.subscriptions.blockNewActivity();
                await f.receive();
                expect(f.observations).deep.equal([]);
                expect(f.statuses).deep.equal([Status.InvalidSubscription]);
            } finally {
                await f.close();
            }
        });
    });

    it("closes a subscription whose report status the peer never acknowledged", async () => {
        const { isClosed } = await receiveKeepalive(ackMissing);

        expect(isClosed).true;
    });

    it("keeps a subscription without compact priming whose final report status the peer never acknowledged", async () => {
        const { isClosed } = await receiveKeepalive(ackMissing, { compactPriming: false });

        expect(isClosed).false;
    });

    it("closes a subscription whose status to a report chunk the peer never acknowledged", async () => {
        const { isClosed, error } = await receiveKeepalive(ackMissing, { chunked: true, compactPriming: false });

        expect(error).undefined;
        expect(isClosed).true;
    });

    it("keeps a subscription whose report status the peer acknowledged", async () => {
        const { isClosed } = await receiveKeepalive(async () => {});

        expect(isClosed).false;
    });

    it("keeps a subscription when the report status fails for another reason", async () => {
        const { isClosed } = await receiveKeepalive(() => Promise.reject(new PeerUnresponsiveError()));

        expect(isClosed).false;
    });

    it("keeps a subscription whose report status goes unacknowledged during shutdown", async () => {
        let blocked: Promise<void> | undefined;
        const { isClosed } = await receiveKeepalive(subscriptions => {
            blocked = subscriptions.blockNewActivity();
            return ackMissing();
        });
        await blocked;

        expect(isClosed).false;
    });
});
