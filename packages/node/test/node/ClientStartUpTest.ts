/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
import { NetworkClient } from "#behavior/system/network/NetworkClient.js";
import { BasicInformationClient } from "#behaviors/basic-information";
import { ProtocolMocks, SessionManager } from "@matter/protocol";
import { Seconds, Timestamp } from "@matter/general";
import { MockSite } from "./mock-site.js";
import { subscribedPeer } from "./node-helpers.js";

describe("Client startUp event handling", () => {
    before(() => MockTime.init());

    it("ignores startUp event when subscription is not yet active", async () => {
        // Set up a commissioned pair and wait for active subscription
        await using site = new MockSite();
        const { controller } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const peerAddress = peer1.stateOf(CommissioningClient).peerAddress!;
        const sessionManager = controller.env.get(SessionManager);

        // Nullify activeSubscription so subscriptionActive returns false while the peer
        // remains online (the session still exists).  This tests the subscriptionActive
        // guard directly without going through device stop, which would also trigger the
        // isOnline guard and close sessions on its own.
        peer1.behaviors.internalsOf(NetworkClient).activeSubscription = undefined;
        expect(peer1.lifecycle.isOnline).true;
        expect(peer1.act(agent => agent.get(NetworkClient).subscriptionActive)).false;

        const sessionsBefore = sessionManager.sessionsFor(peerAddress).length;
        expect(sessionsBefore).greaterThan(0);

        // Emit startUp directly on the peer — the subscriptionActive guard should reject it.
        await peer1.act(agent => {
            const events = (agent as any).basicInformation?.events;
            if (events?.startUp) {
                events.startUp.emit({ softwareVersion: 0 }, agent.context);
            }
        });

        // Sessions should be unchanged because the guard rejected the event.
        const sessionsAfter = sessionManager.sessionsFor(peerAddress).length;
        expect(sessionsAfter).equals(sessionsBefore);
    });

    it("preserves the current session when startUp event fires with active subscription", async () => {
        // Set up commissioned pair with active subscription
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const peerAddress = peer1.stateOf(CommissioningClient).peerAddress!;
        const sessionManager = controller.env.get(SessionManager);

        // Capture the current (live) session — this is the session that must be preserved
        const liveSession = sessionManager.maybeSessionFor(peerAddress);
        expect(liveSession).not.undefined;
        const liveSessionId = liveSession!.id;

        // Emit startUp on the device side — it arrives at the controller via the active
        // subscription and triggers #onStartUp, which calls handlePeerShutdown with
        // asOf = liveSession.createdAt, preserving the live session.
        const startUpReceived = new Promise<void>(resolve => {
            peer1.eventsOf(BasicInformationClient).startUp?.once(() => resolve());
        });

        await device.act(agent => {
            (agent as any).basicInformation.events.startUp.emit({ softwareVersion: 0 }, agent.context);
        });

        await MockTime.resolve(startUpReceived);

        // Two yields are needed: one for #onStartUp to schedule handlePeerShutdown, and one
        // for handlePeerShutdown → #handlePeerLoss to complete its async session iteration.
        await MockTime.yield();
        await MockTime.yield();

        // The live session must survive
        const survivingSessions = sessionManager.sessionsFor(peerAddress);
        expect(survivingSessions.some(s => s.id === liveSessionId)).true;
    });

    it("closes sessions older than current session when startUp fires", async () => {
        // Set up commissioned pair with active subscription
        await using site = new MockSite();
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const peerAddress = peer1.stateOf(CommissioningClient).peerAddress!;
        const sessionManager = controller.env.get(SessionManager);

        // Capture the live session and its creation timestamp
        const liveSession = sessionManager.maybeSessionFor(peerAddress);
        expect(liveSession).not.undefined;

        // The live session was created at T0.  Advance MockTime by 1s so that a new session
        // created now has createdAt = T0+1s, simulating the post-reboot session on the device.
        const liveCreatedAt = liveSession!.createdAt;
        await MockTime.advance(Seconds(1));
        expect(liveCreatedAt).lessThan(MockTime.nowMs);

        // Create the "new post-reboot" session (createdAt = T0+1s).
        const peerNodeId = peerAddress.nodeId;
        const newSession = new ProtocolMocks.NodeSession({
            index: 9991,
            peerNodeId,
            fabric: liveSession!.fabric!,
        });
        expect(newSession.createdAt).greaterThan(liveCreatedAt);

        // Give newSession the highest activeTimestamp so maybeSessionFor picks it over liveSession.
        // Use MAX_SAFE_INTEGER to beat any subscription-driven updates that arrive when startUp
        // is delivered through the live session.
        newSession.activeTimestamp = Timestamp(Number.MAX_SAFE_INTEGER);

        sessionManager.sessions.add(newSession);

        // Emit startUp — #onStartUp will:
        //   1. maybeSessionFor → newSession (highest activeTimestamp)
        //   2. handlePeerShutdown(peerAddress, newSession.createdAt = T0+1s)
        //   3. Close sessions with createdAt < T0+1s → liveSession (at T0) gets closed
        //   4. Preserve sessions with createdAt >= T0+1s → newSession survives
        const startUpReceived = new Promise<void>(resolve => {
            peer1.eventsOf(BasicInformationClient).startUp?.once(() => resolve());
        });

        await device.act(agent => {
            (agent as any).basicInformation.events.startUp.emit({ softwareVersion: 0 }, agent.context);
        });

        await MockTime.resolve(startUpReceived);

        // Two yields are needed: one for #onStartUp to schedule handlePeerShutdown, and one
        // for handlePeerShutdown → #handlePeerLoss to complete its async session iteration.
        await MockTime.yield();
        await MockTime.yield();

        // newSession must survive (createdAt = T0+1s >= asOf = T0+1s)
        const survivingSessions = sessionManager.sessionsFor(peerAddress);
        expect(survivingSessions.some(s => s.id === newSession.id)).true;

        // liveSession must be closed (createdAt = T0 < asOf = T0+1s)
        expect(survivingSessions.some(s => s.id === liveSession!.id)).false;

        // Clean up the injected session if not already closed by the handler
        if (!newSession.isClosing) {
            await newSession.initiateClose();
        }
    });
});
