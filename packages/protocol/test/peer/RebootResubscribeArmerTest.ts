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
import { Environment, MemoryStorageDriver, Minutes, Seconds, StandardCrypto, StorageContext } from "@matter/general";
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
    function registerSubscription() {
        const subscription = new PeerSubscription({
            lifetime: subscriptions,
            request: Subscribe({ keepSubscriptions: true }),
            peer: PEER,
            closed: () => subscriptions.delete(subscription),
            response: { subscriptionId: nextSubscriptionId++, maxInterval: 3600 },
            maxPeerResponseTime: Seconds(1),
        });
        subscriptions.addPeer(subscription);
        return subscription;
    }

    function reportOver(session: NodeSession) {
        subscriptions.reportStarted.emit(session);
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
        reportOver,
        isSubscribed,
        sessionLives,
        whenClosed,
    };
}

describe("RebootResubscribeArmer", () => {
    beforeEach(() => MockTime.reset());

    it("closes older sessions when the armed device returns", async () => {
        const { armer, createSession, sessionLives, whenClosed } = await setup();
        using _armer = armer;
        const older = await createSession();
        armer.arm(PEER);
        await MockTime.advance(Seconds(1));
        const olderClosed = whenClosed(older);
        const returned = await createSession();
        await MockTime.resolve(olderClosed);

        expect(sessionLives(older)).equals(false);
        expect(sessionLives(returned)).equals(true);
    });

    it("re-subscribes when no report arrives within the grace window", async () => {
        const { armer, createSession, registerSubscription, isSubscribed } = await setup();
        using _armer = armer;
        const subscription = registerSubscription();
        armer.arm(PEER);
        await createSession();
        await MockTime.macrotasks;
        expect(isSubscribed(subscription)).equals(true);

        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(false);
    });

    it("keeps the subscription when a report arrives over the returning session", async () => {
        const { armer, createSession, registerSubscription, reportOver, isSubscribed } = await setup();
        using _armer = armer;
        const subscription = registerSubscription();
        armer.arm(PEER);
        const returned = await createSession();
        await MockTime.macrotasks;

        reportOver(returned);

        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(true);
    });

    it("keeps the subscription when a report arrives over a session opened after the return", async () => {
        const { armer, createSession, registerSubscription, reportOver, isSubscribed } = await setup();
        using _armer = armer;
        const subscription = registerSubscription();
        armer.arm(PEER);
        await createSession();
        await MockTime.macrotasks;

        // A session we open ourselves after the return carries data just as well as the returning one.
        const later = await createSession(true);
        reportOver(later);

        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(true);
    });

    it("re-subscribes when the only report arrives over a pre-reboot session", async () => {
        const { armer, createSession, registerSubscription, reportOver, isSubscribed } = await setup();
        using _armer = armer;
        const subscription = registerSubscription();
        const preReboot = await createSession();
        armer.arm(PEER);
        const returned = await createSession();
        await MockTime.macrotasks;

        // A rebooting device flushes its dying subscription, and that flush can be decoded at the same instant the
        // returning session appears or well after it.  Either way it is data from before the reboot.
        reportOver(preReboot);
        expect(returned.createdAt).equals(preReboot.createdAt);
        await MockTime.advance(Seconds(10));
        reportOver(preReboot);

        await MockTime.advance(Seconds(20));
        expect(isSubscribed(subscription)).equals(false);
    });

    it("re-subscribes when the only report arrives before the peer returns", async () => {
        const { armer, createSession, registerSubscription, reportOver, isSubscribed } = await setup();
        using _armer = armer;
        const subscription = registerSubscription();
        const preReboot = await createSession();
        armer.arm(PEER);

        // Traffic between arming and the return is the device on its way out, not a subscription that survived.
        reportOver(preReboot);

        await createSession();
        await MockTime.macrotasks;

        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(false);
    });

    it("keeps the subscription when the peer opens a second session after reporting", async () => {
        const { armer, createSession, registerSubscription, reportOver, isSubscribed } = await setup();
        using _armer = armer;
        const subscription = registerSubscription();
        armer.arm(PEER);

        const returned = await createSession();
        await MockTime.macrotasks;
        reportOver(returned);

        // A device opens further sessions for its own reasons — bindings, its own reads, an OTA notification — so
        // one does not mean it rebooted again and must not discard what it already proved.
        await MockTime.advance(Seconds(10));
        await createSession();
        await MockTime.macrotasks;

        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(true);
    });

    it("characterization: a second reboot inside the grace window keeps the first return's evidence", async () => {
        // Accepted behaviour, not a goal: telling a second reboot apart from a second session needs a reason for
        // the session that the session itself cannot give. A device that reboots twice inside the grace therefore
        // falls back to the subscription's own liveness timeout, which is what happens without this component at
        // all. Reboot-then-one-session is the case it is built for.
        const { armer, createSession, registerSubscription, reportOver, isSubscribed } = await setup();
        using _armer = armer;
        const subscription = registerSubscription();
        armer.arm(PEER);

        const firstReturn = await createSession();
        await MockTime.macrotasks;
        reportOver(firstReturn);

        await MockTime.advance(Seconds(10));
        await createSession();
        await MockTime.macrotasks;

        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(true);
    });

    it("keeps the subscription when a report arrives over a session we opened after the return", async () => {
        const { armer, createSession, registerSubscription, reportOver, isSubscribed } = await setup();
        using _armer = armer;
        const subscription = registerSubscription();
        await createSession(); // pre-reboot session
        armer.arm(PEER);

        // We reconnect after the device announces itself, so this session carries the returned peer's data even
        // though we opened it.
        await createSession();
        await MockTime.macrotasks;
        const ourReconnect = await createSession(true);
        reportOver(ourReconnect);

        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(true);
    });

    it("discards the previous cycle's returning session as evidence after a re-arm", async () => {
        const { armer, createSession, registerSubscription, reportOver, isSubscribed } = await setup();
        using _armer = armer;
        const subscription = registerSubscription();

        armer.arm(PEER);
        const firstReturn = await createSession();
        await MockTime.macrotasks;

        // The second reboot leaves the first cycle's session outside the new return.
        armer.arm(PEER);
        await createSession();
        await MockTime.macrotasks;
        reportOver(firstReturn);

        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(false);
    });

    it("re-arming replaces the previous return deadline rather than leaving it to fire", async () => {
        const { armer, sessions, createSession, registerSubscription } = await setup();
        using _armer = armer;
        registerSubscription();
        await createSession();

        let peerLossCount = 0;
        const realHandlePeerLoss = sessions.handlePeerLoss.bind(sessions);
        sessions.handlePeerLoss = (address, context) => {
            peerLossCount++;
            return realHandlePeerLoss(address, context);
        };

        armer.arm(PEER);
        await MockTime.advance(Minutes(2));
        armer.arm(PEER);

        // Past the first cycle's deadline but short of the second's: only the live deadline may recover the peer.
        await MockTime.advance(Minutes(2));
        await MockTime.macrotasks;

        expect(peerLossCount).equals(0);
    });

    it("ignores sessions for peers that are not armed", async () => {
        const { armer, createSession, sessionLives } = await setup();
        using _armer = armer;
        const older = await createSession();
        await MockTime.advance(Seconds(1));
        await createSession();
        await MockTime.macrotasks;

        // Mechanism A never ran, so the older session is untouched.
        expect(sessionLives(older)).equals(true);
    });

    it("disarm cancels a pending re-subscribe", async () => {
        const { armer, createSession, registerSubscription, isSubscribed } = await setup();
        using _armer = armer;
        const subscription = registerSubscription();
        armer.arm(PEER);
        await createSession();
        await MockTime.macrotasks;
        armer.disarm(PEER);

        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(true);
    });

    it("still handles a late session if the device returns before the deadline", async () => {
        const { armer, createSession, sessionLives, whenClosed } = await setup();
        using _armer = armer;
        const older = await createSession();
        armer.arm(PEER);
        await MockTime.advance(Minutes(2)); // still short of the return deadline
        expect(sessionLives(older)).equals(true); // nothing happened while waiting

        const olderClosed = whenClosed(older);
        const returned = await createSession(); // arrives before the deadline; the arm is still live
        await MockTime.resolve(olderClosed);
        expect(sessionLives(older)).equals(false);
        expect(sessionLives(returned)).equals(true);
    });

    it("recovers the peer when no session returns within the return deadline", async () => {
        const { armer, createSession, registerSubscription, isSubscribed, sessionLives } = await setup();
        using _armer = armer;
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
    });

    it("cancels the return deadline once the device returns", async () => {
        const { armer, sessions, createSession } = await setup();
        using _armer = armer;
        await createSession(); // pre-reboot session

        let peerLossCount = 0;
        const realHandlePeerLoss = sessions.handlePeerLoss.bind(sessions);
        sessions.handlePeerLoss = (address, context) => {
            peerLossCount++;
            return realHandlePeerLoss(address, context);
        };

        armer.arm(PEER);
        await MockTime.advance(Seconds(1));
        await createSession(); // device returns and cancels the deadline
        await MockTime.macrotasks;

        await MockTime.advance(Minutes(5)); // past the original deadline
        await MockTime.macrotasks;

        expect(peerLossCount).equals(0); // return-timeout recovery never ran
    });

    it("disarm before the deadline cancels the recovery", async () => {
        const { armer, sessions, createSession } = await setup();
        using _armer = armer;
        await createSession(); // pre-reboot session

        let peerLossCount = 0;
        const realHandlePeerLoss = sessions.handlePeerLoss.bind(sessions);
        sessions.handlePeerLoss = (address, context) => {
            peerLossCount++;
            return realHandlePeerLoss(address, context);
        };

        armer.arm(PEER);
        armer.disarm(PEER);

        await MockTime.advance(Minutes(5));
        await MockTime.macrotasks;

        expect(peerLossCount).equals(0);
    });

    it("ignores a controller-initiated session (isInitiator true) even for an armed peer", async () => {
        const { armer, createSession, registerSubscription, isSubscribed, sessionLives } = await setup();
        using _armer = armer;
        const subscription = registerSubscription();
        const older = await createSession();
        armer.arm(PEER);
        await MockTime.advance(Seconds(1));
        await createSession(true); // our own connect, not a reboot return
        await MockTime.macrotasks;

        expect(sessionLives(older)).equals(true); // Mechanism A must not run
        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(true);
    });

    it("re-arming drops the prior grace timer so it cannot fire closeForPeer on its own schedule", async () => {
        const { armer, createSession, registerSubscription, isSubscribed } = await setup();
        using _armer = armer;
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
    });

    it("re-arming requires fresh evidence for the new cycle", async () => {
        const { armer, createSession, registerSubscription, reportOver, isSubscribed } = await setup();
        using _armer = armer;
        const subscription = registerSubscription();

        armer.arm(PEER);
        const firstReturn = await createSession();
        await MockTime.macrotasks;
        reportOver(firstReturn);

        // A second reboot: what the peer sent during the first one says nothing about this one.
        armer.arm(PEER);
        await createSession();
        await MockTime.macrotasks;

        await MockTime.advance(Seconds(30));
        expect(isSubscribed(subscription)).equals(false);
    });

    it("disarm of an un-armed peer is a no-op", async () => {
        const { armer } = await setup();
        using _armer = armer;
        expect(() => armer.disarm(PEER)).not.throw();
    });
});
