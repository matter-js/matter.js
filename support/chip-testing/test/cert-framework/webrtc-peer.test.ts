/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Seconds, Time } from "@matter/general";
import { expect } from "chai";
import { WebRtcPeer } from "../cert/webrtc-peer.js";

/**
 * Two peers in this process stand in for the controller and the camera, so everything but the camera's
 * own quirks is exercised without a chip binary.
 */
async function connected(a: WebRtcPeer, b: WebRtcPeer) {
    return (await Promise.all([a.connected(Seconds(10)), b.connected(Seconds(10))])).every(Boolean);
}

/** Feeds each side whatever the other has gathered, until both connect or the budget runs out. */
async function trickle(a: WebRtcPeer, b: WebRtcPeer) {
    const endsAt = Time.nowUs + Seconds(10);
    while (Time.nowUs < endsAt) {
        b.add(a.take());
        a.add(b.take());
        if (a.state === "connected" && b.state === "connected") {
            return true;
        }
        await Time.sleep("peer exchange", Seconds(0.1));
    }
    return false;
}

describe("WebRtcPeer", () => {
    it("connects an offering peer to an answering one", async function () {
        this.timeout(30_000);

        const offerer = new WebRtcPeer("offerer");
        const answerer = new WebRtcPeer("answerer");

        try {
            const answer = answerer.answer(offerer.offer());
            offerer.accept(answer);

            await trickle(offerer, answerer);

            expect(await connected(offerer, answerer)).equal(true);
        } finally {
            offerer.close();
            answerer.close();
        }
    });

    it("settles a DTLS role the answer left open, and says that it did", async function () {
        this.timeout(30_000);

        const offerer = new WebRtcPeer("offerer");
        const answerer = new WebRtcPeer("answerer");

        try {
            const answer = answerer.answer(offerer.offer());

            // What chip's camera sends: an answer may not leave the role open, and the connection
            // refuses such an answer outright rather than choosing for itself
            const unsettled = answer.replaceAll("a=setup:active", "a=setup:actpass");
            expect(unsettled).not.equal(answer);

            expect(offerer.accept(unsettled)).deep.equal({ rewroteRole: true });
            expect(await connected(offerer, answerer)).equal(true);
        } finally {
            offerer.close();
            answerer.close();
        }
    });

    it("reports an answer it did not have to rewrite", async function () {
        this.timeout(30_000);

        const offerer = new WebRtcPeer("offerer");
        const answerer = new WebRtcPeer("answerer");

        try {
            expect(offerer.accept(answerer.answer(offerer.offer()))).deep.equal({ rewroteRole: false });
        } finally {
            offerer.close();
            answerer.close();
        }
    });

    it("hands each candidate over once", async function () {
        this.timeout(30_000);

        const peer = new WebRtcPeer("gatherer");

        try {
            peer.offer();
            await Time.sleep("gathering", Seconds(2));

            const first = peer.take();
            expect(first.length).greaterThan(0);
            expect(peer.take()).deep.equal([]);

            // The library names the media section, and the index of that section is not ours to invent
            expect(first[0].sdpMid).not.equal(null);
            expect(first[0].sdpmLineIndex).equal(null);
        } finally {
            peer.close();
        }
    });

    it("closes a peer that never offered, and so has no channel", () => {
        const peer = new WebRtcPeer("answerer-only");
        expect(() => peer.close()).not.throw();
    });

    it("reports a closed connection as not connected rather than waiting out the budget", async function () {
        this.timeout(30_000);

        const peer = new WebRtcPeer("closed");
        peer.offer();
        peer.close();

        const started = Time.nowUs;
        expect(await peer.connected(Seconds(10))).equal(false);
        expect(Time.nowUs - started).lessThan(Seconds(5));
    });
});
