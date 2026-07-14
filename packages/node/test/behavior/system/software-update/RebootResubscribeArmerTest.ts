/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { RebootResubscribeArmer } from "#behavior/system/software-update/RebootResubscribeArmer.js";
import { Observable, Seconds, Time, Timestamp } from "@matter/general";
import { PeerAddress } from "@matter/protocol";
import { FabricIndex, NodeId } from "@matter/types";

const PEER = PeerAddress({ fabricIndex: FabricIndex(1), nodeId: NodeId(0x44cn) });

function setup() {
    const added = Observable<[RebootResubscribeArmer.SessionLike]>();
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

    function emitSession(peerAddress = PEER) {
        added.emit({ peerAddress, createdAt: Time.nowMs });
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
});
