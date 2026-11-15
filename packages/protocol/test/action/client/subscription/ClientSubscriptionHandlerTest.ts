/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientSubscriptionHandler } from "#action/client/subscription/ClientSubscriptionHandler.js";
import { ClientSubscriptions } from "#action/client/subscription/ClientSubscriptions.js";
import { PeerSubscription } from "#action/client/subscription/PeerSubscription.js";
import { Subscribe } from "#action/request/Subscribe.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { MessageType } from "#interaction/InteractionMessenger.js";
import { PeerAckMissingError, PeerUnresponsiveError } from "#peer/PeerCommunicationError.js";
import type { MessageExchange } from "#protocol/MessageExchange.js";
import type { NodeSession } from "#session/NodeSession.js";
import { SessionManager } from "#session/SessionManager.js";
import { SessionParameters } from "#session/SessionParameters.js";
import { DataReadQueue, Lifetime, MemoryStorageDriver, Seconds, StandardCrypto, StorageContext } from "@matter/general";
import { Specification } from "@matter/model";
import { NodeId, TlvDataReport } from "@matter/types";

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
