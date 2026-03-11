/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommissioningClient } from "#behavior/system/commissioning/CommissioningClient.js";
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
        const { controller, device } = await site.addCommissionedPair();
        const peer1 = await subscribedPeer(controller, "peer1");

        const peerAddress = peer1.stateOf(CommissioningClient).peerAddress!;
        const sessionManager = controller.env.get(SessionManager);

        // Bring the device offline so the subscription is no longer active
        await MockTime.resolve(device.stop());
        if (peer1.lifecycle.isOnline) {
            await MockTime.resolve(peer1.lifecycle.offline);
        }

        // Count sessions — device stopping will have closed them already.
        const sessionsBefore = sessionManager.sessionsFor(peerAddress).length;

        // Emit startUp directly on the peer's basicInformation — mimics a stale
        // startUp event arriving during initial subscription establishment when the
        // guard check `subscriptionActive` is false.
        await peer1.act(agent => {
            const events = (agent as any).basicInformation?.events;
            if (events?.startUp) {
                events.startUp.emit({ softwareVersion: 0 }, agent.context);
            }
        });

        // Sessions should be unchanged because the guard rejected the event
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

        // Yield so the async #onStartUp handler can complete
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

        // Create a stale "pre-reboot" session. Since MockTime is frozen and both the live session
        // and any new mock session would get the same createdAt, we simulate an older session by
        // capturing the live session's createdAt and creating a session with a lower (manually
        // back-dated) timestamp. We do this by advancing MockTime by 1s, then checking that the
        // existing live session's createdAt is still at T0 while Time.nowMs is T0+1000.
        const liveCreatedAt = liveSession!.createdAt;

        // Advance time so that if a new session is created now it will have createdAt = T0+1s
        await MockTime.advance(Seconds(1));
        expect(liveCreatedAt).lessThan(MockTime.nowMs);

        // Create a "new post-reboot" session that simulates what the device would use after reboot.
        // This is newer than liveSession (T0 vs T0+1s).
        const peerNodeId = peerAddress.nodeId;
        const newSession = new ProtocolMocks.NodeSession({
            index: 9991,
            peerNodeId,
            fabric: liveSession!.fabric!,
        });
        expect(newSession.createdAt).greaterThan(liveCreatedAt);

        // Make newSession appear most-recently-active so #onStartUp's maybeSessionFor picks it.
        // Use a far-future timestamp to ensure it beats any subscription-driven activeTimestamp
        // updates on the live session that may occur when the startUp event is delivered.
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
        await MockTime.yield();
        await MockTime.yield();

        // newSession must survive (createdAt = T0+1s >= asOf = T0+1s)
        const survivingSessions = sessionManager.sessionsFor(peerAddress);
        expect(survivingSessions.some(s => s.id === newSession.id)).true;

        // liveSession must be closed (createdAt = T0 < asOf = T0+1s)
        expect(survivingSessions.some(s => s.id === liveSession!.id)).false;

        // Clean up
        if (!newSession.isClosing) {
            await newSession.initiateClose();
        }
    });
});
