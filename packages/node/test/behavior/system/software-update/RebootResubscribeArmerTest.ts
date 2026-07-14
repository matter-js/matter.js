/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RebootResubscribeArmer } from "#behavior/system/software-update/RebootResubscribeArmer.js";
import { Observable, Seconds, Time, Timestamp } from "@matter/general";
import { NodeSession, PeerAddress } from "@matter/protocol";
import { FabricIndex, NodeId } from "@matter/types";

const PEER = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(0x44cn) });

/** Fake NodeSession carrying only the fields the armer reads. */
function fakeSession(peerAddress: PeerAddress, createdAt: Timestamp, isInitiator: boolean): NodeSession {
    return { peerAddress, createdAt, isInitiator } as unknown as NodeSession;
}

function setup() {
    const added = Observable<[NodeSession]>();
    const closeOlderCalls = new Array<{ address: PeerAddress; asOf: Timestamp }>();
    const closeForPeerCalls = new Array<PeerAddress>();
    let lastReportStartedAt: Timestamp | undefined;

    const armer = new RebootResubscribeArmer({
        onSessionAdded: added,
        closeOlderSessions: (address, asOf) => {
            closeOlderCalls.push({ address, asOf });
        },
        lastReportStartedAtFor: () => lastReportStartedAt,
        closeForPeer: address => {
            closeForPeerCalls.push(address);
        },
    });

    function emitSession(peerAddress = PEER, isInitiator = false) {
        added.emit(fakeSession(peerAddress, Time.nowMs, isInitiator));
    }

    return {
        armer,
        emitSession,
        closeOlderCalls,
        closeForPeerCalls,
        setLastReportAt: (t: Timestamp) => (lastReportStartedAt = t),
    };
}

describe("RebootResubscribeArmer", () => {
    beforeEach(() => MockTime.reset());

    it("closes older sessions when the armed device returns", () => {
        const { armer, emitSession, closeOlderCalls } = setup();
        armer.arm(PEER);
        const at = Time.nowMs;
        emitSession();
        expect(closeOlderCalls.length).equals(1);
        expect(closeOlderCalls[0].address).deep.equals(PEER);
        expect(closeOlderCalls[0].asOf).equals(at);
        armer[Symbol.dispose]();
    });

    it("re-subscribes when no report arrives within the grace window", async () => {
        const { armer, emitSession, closeForPeerCalls } = setup();
        armer.arm(PEER, { grace: Seconds(30) });
        emitSession();
        expect(closeForPeerCalls.length).equals(0);
        await MockTime.advance(Seconds(30));
        expect(closeForPeerCalls).deep.equals([PEER]);
        armer[Symbol.dispose]();
    });

    it("keeps the subscription when a report arrives within the grace window", async () => {
        const { armer, emitSession, setLastReportAt, closeForPeerCalls } = setup();
        armer.arm(PEER, { grace: Seconds(30) });
        emitSession();
        setLastReportAt(Time.nowMs); // device fed the existing subscription after returning
        await MockTime.advance(Seconds(30));
        expect(closeForPeerCalls.length).equals(0);
        armer[Symbol.dispose]();
    });

    it("re-subscribes when the last report predates the returning session", async () => {
        const { armer, emitSession, setLastReportAt, closeForPeerCalls } = setup();
        setLastReportAt(Time.nowMs); // stale report from before the reboot
        await MockTime.advance(Seconds(5));
        armer.arm(PEER, { grace: Seconds(30) });
        emitSession();
        await MockTime.advance(Seconds(30));
        expect(closeForPeerCalls).deep.equals([PEER]);
        armer[Symbol.dispose]();
    });

    it("ignores sessions for peers that are not armed", () => {
        const { armer, emitSession, closeOlderCalls } = setup();
        emitSession();
        expect(closeOlderCalls.length).equals(0);
        armer[Symbol.dispose]();
    });

    it("disarm cancels a pending re-subscribe", async () => {
        const { armer, emitSession, closeForPeerCalls } = setup();
        armer.arm(PEER, { grace: Seconds(30) });
        emitSession();
        armer.disarm(PEER);
        await MockTime.advance(Seconds(30));
        expect(closeForPeerCalls.length).equals(0);
        armer[Symbol.dispose]();
    });

    it("stays armed indefinitely and still handles a late session if the device never returns", async () => {
        const { armer, emitSession, closeOlderCalls, closeForPeerCalls } = setup();
        armer.arm(PEER);
        await MockTime.advance(Seconds(600));
        expect(closeOlderCalls.length).equals(0);
        expect(closeForPeerCalls.length).equals(0);
        emitSession(); // arrives late; the arm is still live
        expect(closeOlderCalls.length).equals(1);
        armer[Symbol.dispose]();
    });

    it("ignores a controller-initiated session (isInitiator true) even for an armed peer", async () => {
        const { armer, emitSession, closeOlderCalls, closeForPeerCalls } = setup();
        armer.arm(PEER, { grace: Seconds(30) });
        emitSession(PEER, true);
        expect(closeOlderCalls.length).equals(0);
        await MockTime.advance(Seconds(30));
        expect(closeForPeerCalls.length).equals(0);
        armer[Symbol.dispose]();
    });

    it("re-arming drops the prior grace timer so it cannot fire closeForPeer on its own schedule", async () => {
        const { armer, emitSession, closeForPeerCalls } = setup();

        // First cycle: arm, session arrives, grace starts.
        armer.arm(PEER, { grace: Seconds(30) });
        emitSession();

        // Re-arm before the first grace expires — this must drop the first cycle's timer/target.
        await MockTime.advance(Seconds(10));
        armer.arm(PEER, { grace: Seconds(30) });

        // Advance by the remainder of the FIRST cycle's grace (would fire at t=30 if the old timer
        // survived re-arming). No new session has arrived in the second cycle, so nothing should fire.
        await MockTime.advance(Seconds(20));
        expect(closeForPeerCalls.length).equals(0);

        // A new session in the second cycle starts a fresh grace that still resolves normally.
        emitSession();
        await MockTime.advance(Seconds(30));
        expect(closeForPeerCalls).deep.equals([PEER]);

        armer[Symbol.dispose]();
    });

    it("disarm of an un-armed peer is a no-op", () => {
        const { armer } = setup();
        expect(() => armer.disarm(PEER)).not.throw();
        armer[Symbol.dispose]();
    });
});
