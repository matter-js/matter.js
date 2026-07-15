/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientSubscriptions } from "#action/client/subscription/ClientSubscriptions.js";
import { PeerSubscription } from "#action/client/subscription/PeerSubscription.js";
import { Subscribe } from "#action/request/Subscribe.js";
import { FabricManager } from "#fabric/FabricManager.js";
import { PeerAddress } from "#peer/PeerAddress.js";
import { RebootResubscribeArmer } from "#peer/RebootResubscribeArmer.js";
import type { NodeSession } from "#session/NodeSession.js";
import { SessionManager } from "#session/SessionManager.js";
import { SessionParameters } from "#session/SessionParameters.js";
import {
    Environment,
    MemoryStorageDriver,
    Minutes,
    Seconds,
    StandardCrypto,
    StorageContext,
    Time,
    Timestamp,
} from "@matter/general";
import { FabricIndex, NodeId } from "@matter/types";

const PEER = PeerAddress({ fabricIndex: FabricIndex.NO_FABRIC, nodeId: NodeId(0x44cn) });
const EMPTY = new Uint8Array();

async function setup() {
    const storage = new MemoryStorageDriver();
    storage.initialize();
    const storageContext = new StorageContext(storage, ["sessions"]);

    const sessions = new SessionManager({
        parameters: SessionParameters.defaults,
        fabrics: new FabricManager(new StandardCrypto()),
        storage: storageContext,
    });
    await sessions.construction.ready;

    const subscriptions = new ClientSubscriptions(new Environment("test"));

    const armer = new RebootResubscribeArmer(sessions, subscriptions);

    let nextSessionId = 100;
    async function createSession(isInitiator = false): Promise<NodeSession> {
        return sessions.createSecureSession({
            id: nextSessionId++,
            fabric: undefined,
            peerNodeId: PEER.nodeId,
            peerSessionId: 0x8d4b,
            sharedSecret: EMPTY,
            salt: EMPTY,
            isInitiator,
            isResumption: false,
        });
    }

    let nextSubscriptionId = 1;
    function registerSubscription(lastReportStartedAt?: Timestamp) {
        const subscription = new PeerSubscription({
            lifetime: subscriptions,
            request: Subscribe({ keepSubscriptions: true }),
            peer: PEER,
            closed: () => subscriptions.delete(subscription),
            response: { subscriptionId: nextSubscriptionId++, maxInterval: 3600 },
            maxPeerResponseTime: Seconds(1),
        });
        subscription.lastReportStartedAt = lastReportStartedAt;
        subscriptions.addPeer(subscription);
        return subscription;
    }

    function isSubscribed(subscription: PeerSubscription) {
        return subscriptions.getPeer(PEER, subscription.subscriptionId) !== undefined;
    }

    function sessionLives(session: NodeSession) {
        return [...sessions.sessions].includes(session);
    }

    function whenClosed(session: NodeSession) {
        return new Promise<void>(resolve => {
            sessions.sessions.deleted.on(deleted => {
                if (deleted === session) {
                    resolve();
                }
            });
        });
    }

    return {
        armer,
        sessions,
        subscriptions,
        createSession,
        registerSubscription,
        isSubscribed,
        sessionLives,
        whenClosed,
    };
}

describe("RebootResubscribeArmer", () => {
    beforeEach(() => MockTime.reset());

    it("closes older sessions when the armed device returns", async () => {
        const { armer, createSession, sessionLives, whenClosed } = await setup();
        const older = await createSession();
        armer.arm(PEER);
        await MockTime.advance(Seconds(1));
        const olderClosed = whenClosed(older);
        const returned = await createSession();
        await MockTime.resolve(olderClosed);

        expect(sessionLives(older)).equals(false);
        expect(sessionLives(returned)).equals(true);
        armer[Symbol.dispose]();
    });

    it("re-subscribes when no report arrives within the grace window", async () => {
        const { armer, createSession, registerSubscription, isSubscribed } = await setup();
        const subscription = registerSubscription();
        armer.arm(PEER);
        await createSession();
        await MockTime.macrotasks;
        expect(isSubscribed(subscription)).equals(true);

        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(false);
        armer[Symbol.dispose]();
    });

    it("keeps the subscription when a report arrives within the grace window", async () => {
        const { armer, createSession, registerSubscription, isSubscribed } = await setup();
        const subscription = registerSubscription();
        armer.arm(PEER);
        await createSession();
        await MockTime.macrotasks;

        // Device fed the existing subscription after returning.
        subscription.lastReportStartedAt = Time.nowMs;

        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(true);
        armer[Symbol.dispose]();
    });

    it("re-subscribes when the last report predates the returning session", async () => {
        const { armer, createSession, registerSubscription, isSubscribed } = await setup();
        const subscription = registerSubscription(Time.nowMs); // stale report from before the reboot
        await MockTime.advance(Seconds(5));
        armer.arm(PEER);
        await createSession();
        await MockTime.macrotasks;

        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(false);
        armer[Symbol.dispose]();
    });

    it("ignores sessions for peers that are not armed", async () => {
        const { armer, createSession, sessionLives } = await setup();
        const older = await createSession();
        await MockTime.advance(Seconds(1));
        await createSession();
        await MockTime.macrotasks;

        // Mechanism A never ran, so the older session is untouched.
        expect(sessionLives(older)).equals(true);
        armer[Symbol.dispose]();
    });

    it("disarm cancels a pending re-subscribe", async () => {
        const { armer, createSession, registerSubscription, isSubscribed } = await setup();
        const subscription = registerSubscription();
        armer.arm(PEER);
        await createSession();
        await MockTime.macrotasks;
        armer.disarm(PEER);

        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(true);
        armer[Symbol.dispose]();
    });

    it("still handles a late session if the device returns before the deadline", async () => {
        const { armer, createSession, sessionLives, whenClosed } = await setup();
        const older = await createSession();
        armer.arm(PEER);
        await MockTime.advance(Minutes(4)); // still short of the return deadline
        expect(sessionLives(older)).equals(true); // nothing happened while waiting

        const olderClosed = whenClosed(older);
        const returned = await createSession(); // arrives before the deadline; the arm is still live
        await MockTime.resolve(olderClosed);
        expect(sessionLives(older)).equals(false);
        expect(sessionLives(returned)).equals(true);
        armer[Symbol.dispose]();
    });

    it("recovers the peer when no session returns within the return deadline", async () => {
        const { armer, createSession, registerSubscription, isSubscribed, sessionLives } = await setup();
        const subscription = registerSubscription();
        const stale = await createSession(); // pre-reboot session, established before arming
        armer.arm(PEER);

        await MockTime.advance(Minutes(5)); // device never returns
        // The recovery is a fire-and-forget chain (handlePeerLoss then closeForPeer); wait for both effects.
        await MockTime.resolve(
            (async () => {
                while (sessionLives(stale) || isSubscribed(subscription)) {
                    await MockTime.yield();
                }
            })(),
        );

        expect(sessionLives(stale)).equals(false); // handlePeerLoss dropped the stale session
        expect(isSubscribed(subscription)).equals(false); // closeForPeer forced re-subscription
        armer[Symbol.dispose]();
    });

    it("cancels the return deadline once the device returns", async () => {
        const { armer, sessions, createSession } = await setup();
        await createSession(); // pre-reboot session

        let peerLossCount = 0;
        const realHandlePeerLoss = sessions.handlePeerLoss.bind(sessions);
        sessions.handlePeerLoss = (address, cause, asOf) => {
            peerLossCount++;
            return realHandlePeerLoss(address, cause, asOf);
        };

        armer.arm(PEER);
        await MockTime.advance(Seconds(1));
        await createSession(); // device returns and cancels the deadline
        await MockTime.macrotasks;

        await MockTime.advance(Minutes(5)); // past the original deadline
        await MockTime.macrotasks;

        expect(peerLossCount).equals(0); // return-timeout recovery never ran
        armer[Symbol.dispose]();
    });

    it("disarm before the deadline cancels the recovery", async () => {
        const { armer, sessions, createSession } = await setup();
        await createSession(); // pre-reboot session

        let peerLossCount = 0;
        const realHandlePeerLoss = sessions.handlePeerLoss.bind(sessions);
        sessions.handlePeerLoss = (address, cause, asOf) => {
            peerLossCount++;
            return realHandlePeerLoss(address, cause, asOf);
        };

        armer.arm(PEER);
        armer.disarm(PEER);

        await MockTime.advance(Minutes(5));
        await MockTime.macrotasks;

        expect(peerLossCount).equals(0);
        armer[Symbol.dispose]();
    });

    it("ignores a controller-initiated session (isInitiator true) even for an armed peer", async () => {
        const { armer, createSession, registerSubscription, isSubscribed, sessionLives } = await setup();
        const subscription = registerSubscription();
        const older = await createSession();
        armer.arm(PEER);
        await MockTime.advance(Seconds(1));
        await createSession(true); // our own connect, not a reboot return
        await MockTime.macrotasks;

        expect(sessionLives(older)).equals(true); // Mechanism A must not run
        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(true);
        armer[Symbol.dispose]();
    });

    it("re-arming drops the prior grace timer so it cannot fire closeForPeer on its own schedule", async () => {
        const { armer, createSession, registerSubscription, isSubscribed } = await setup();
        const subscription = registerSubscription();

        // First cycle: arm, session arrives, grace starts.
        armer.arm(PEER);
        await createSession();
        await MockTime.macrotasks;

        // Re-arm before the first grace expires — this must drop the first cycle's timer/target.
        await MockTime.advance(Seconds(10));
        armer.arm(PEER);

        // Advance by the remainder of the FIRST cycle's grace (would fire at t=30 if the old timer
        // survived re-arming). No new session has arrived in the second cycle, so nothing should fire.
        await MockTime.advance(Seconds(20));
        expect(isSubscribed(subscription)).equals(true);

        // A new session in the second cycle starts a fresh grace that still resolves normally.
        await createSession();
        await MockTime.macrotasks;
        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(false);

        armer[Symbol.dispose]();
    });

    it("disarm of an un-armed peer is a no-op", async () => {
        const { armer } = await setup();
        expect(() => armer.disarm(PEER)).not.throw();
        armer[Symbol.dispose]();
    });
});
