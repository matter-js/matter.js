/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, Millis, Time } from "@matter/main";
import type { WebRtcIceCandidate } from "@matter/testing";
import { DataChannel, PeerConnection, cleanup } from "node-datachannel";

/**
 * The controller's half of a WebRTC connection, for the cases whose plan step is "the session is
 * established" rather than "the signaling was refused".
 *
 * Those cases cannot be proved by signaling alone: the provider reports its peer connection connected
 * only once an answer, candidates and the DTLS handshake have all gone through, so the certification
 * controller has to be a real WebRTC endpoint. matter.js does not supply one — the WebRTC media plane
 * is the consuming application's, and `WebRtcTransportRequestorServer` surfaces signaling as events
 * precisely so an application can drive its own peer connection — so the harness brings one, through
 * a dependency of this package alone.
 *
 * Nothing here interprets media. The connection carries no track and no data; reaching `connected` is
 * the whole purpose, because that is what the plan asks the provider to report.
 */
export class WebRtcPeer {
    readonly #connection: PeerConnection;
    readonly #localCandidates = new Array<WebRtcIceCandidate>();
    #channel?: DataChannel;
    #state = "new";

    constructor(name = "dut") {
        // No ICE servers: both ends are on the same host, so host candidates reach each other and a
        // STUN round trip would only add a way for this to fail
        this.#connection = new PeerConnection(name, { iceServers: [] });

        this.#connection.onLocalCandidate((candidate, mid) =>
            this.#localCandidates.push({ candidate, sdpMid: mid, sdpmLineIndex: 0 }),
        );
        this.#connection.onStateChange(state => (this.#state = state));
    }

    /** What the connection last reported, as `node-datachannel` names it. */
    get state() {
        return this.#state;
    }

    /**
     * Answers the provider's offer, and returns the answer to send back.
     *
     * The description is generated as a side effect of accepting the remote one, so this reads it
     * back rather than asking for it.
     */
    answer(offer: string): string {
        this.#connection.setRemoteDescription(offer, "offer");
        const local = this.#connection.localDescription();
        if (local?.sdp === undefined) {
            throw new Error("Peer connection produced no answer for the provider's offer");
        }
        return local.sdp;
    }

    /**
     * Creates the offer for a session this side initiates, for the provider to answer.
     *
     * The connection carries a data channel because a peer connection with nothing to negotiate cannot
     * describe itself — libdatachannel raises "No DataChannel or Track to negotiate". Nothing is sent
     * over it; it exists so the offer has a media section, and the provider adds its own video to the
     * answer.
     */
    offer(): string {
        this.#channel ??= this.#connection.createDataChannel("matter.js");
        this.#connection.setLocalDescription();
        const local = this.#connection.localDescription();
        if (local?.sdp === undefined) {
            throw new Error("Peer connection produced no offer");
        }
        return local.sdp;
    }

    /**
     * Accepts the provider's answer to {@link offer}.
     *
     * chip's camera answers `a=setup:actpass`, which an answer may not carry — RFC 8842 § 5.3 has the
     * answerer pick `active` or `passive`, since `actpass` is the offer's way of leaving the choice
     * open. libdatachannel refuses such an answer outright ("Illegal role actpass in remote answer
     * description"), so this settles the role the way the specification says the answerer should have:
     * the answerer becomes the DTLS client. Reported upstream; rewriting it here is what lets the case
     * test what it is about, which is the Answer command rather than DTLS role negotiation.
     */
    accept(answer: string) {
        this.#connection.setRemoteDescription(answer.replaceAll("a=setup:actpass", "a=setup:active"), "answer");
    }

    /** Adds what the provider's `ICECandidates` carried. */
    add(candidates: readonly WebRtcIceCandidate[]) {
        for (const { candidate, sdpMid } of candidates) {
            this.#connection.addRemoteCandidate(candidate, sdpMid ?? "0");
        }
    }

    /**
     * The candidates gathered so far, which a case sends to the provider. Gathering is continuous, so
     * a caller takes what there is rather than waiting for an end that a host-only connection does not
     * announce.
     */
    take(): WebRtcIceCandidate[] {
        return this.#localCandidates.splice(0);
    }

    /** Resolves once the connection reports `connected`, or `false` where it does not within `timeout`. */
    async connected(timeout: Duration): Promise<boolean> {
        const endsAt = Time.nowUs + timeout;
        while (Time.nowUs < endsAt) {
            if (this.#state === "connected") {
                return true;
            }
            if (this.#state === "failed" || this.#state === "closed") {
                return false;
            }
            await Time.sleep("webrtc connection", Millis(100));
        }
        return this.#state === "connected";
    }

    close() {
        this.#channel?.close();
        this.#connection.close();
    }
}

/**
 * Releases `node-datachannel`'s worker threads, which otherwise keep the process alive past the run.
 *
 * Per-process rather than per-connection, so a run calls this once everything that used a peer is
 * closed.
 */
export function closeWebRtc() {
    cleanup();
}
