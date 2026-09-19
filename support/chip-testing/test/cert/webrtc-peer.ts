/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, InternalError, Millis, Time } from "@matter/main";
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
 * Nothing here interprets media. Reaching `connected` is the whole purpose, because that is what the
 * plan asks the provider to report.
 *
 * A closed peer does not release everything the library holds: two connections in one process keep it
 * alive afterwards, and the certification specs share one process. Only `cleanup()` releases that, and
 * only once per process — see {@link closeWebRtc} for where it belongs.
 */
export class WebRtcPeer {
    readonly #connection: PeerConnection;
    readonly #localCandidates = new Array<WebRtcIceCandidate>();
    #channel?: DataChannel;
    #state = "new";
    #everConnected = false;

    constructor(name = "dut") {
        // No ICE servers: both ends are on the same host, so host candidates reach each other and a
        // STUN round trip would only add a way for this to fail
        this.#connection = new PeerConnection(name, { iceServers: [] });

        // The library reports the media id; the index of that section is not something this can know,
        // and the field is nullable for exactly that case
        this.#connection.onLocalCandidate((candidate, mid) =>
            this.#localCandidates.push({ candidate, sdpMid: mid, sdpmLineIndex: null }),
        );
        this.#connection.onStateChange(state => {
            this.#state = state;
            // Sampled state misses a connection that completes and drops between two polls, and the
            // plan asks whether it connected, not whether it still is
            this.#everConnected ||= state === "connected";
        });
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
            throw new InternalError("Peer connection produced no answer for the provider's offer");
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
            throw new InternalError("Peer connection produced no offer");
        }
        return local.sdp;
    }

    /**
     * Accepts the provider's answer to {@link offer}.
     *
     * chip's camera answers `a=setup:actpass`, which an answer may not carry — RFC 8842 § 5.3 has the
     * answerer follow RFC 4145 § 4.1, whose table leaves an answerer `active` or `passive` and never
     * `actpass`, that being the offer's way of leaving the choice open. libdatachannel refuses such an
     * answer outright ("Illegal role actpass in remote answer description"), so this settles the role the way the specification says the answerer should have:
     * the answerer becomes the DTLS client. Reported upstream; rewriting it here is what lets the case
     * test what it is about, which is the Answer command rather than DTLS role negotiation.
     *
     * Reports whether it had to, so a case can say so in its evidence rather than certifying a
     * connection built on an answer the harness altered.
     */
    accept(answer: string): { rewroteRole: boolean } {
        const settled = answer.replaceAll("a=setup:actpass", "a=setup:active");
        this.#connection.setRemoteDescription(settled, "answer");
        return { rewroteRole: settled !== answer };
    }

    /**
     * Adds what the provider's `ICECandidates` carried.
     *
     * A candidate names its media section either way round: by id, or by the index of that section in
     * the description. The library takes the id, so a candidate that carries only an index has it
     * resolved against the remote description's own sections rather than being attached to the first
     * one — which is a different section as soon as a description carries more than one, and a
     * candidate attached to the wrong one is simply ignored by the far end.
     *
     * @see {@link MatterSpecification.v16.Cluster} § 11.4.5.4
     */
    add(candidates: readonly WebRtcIceCandidate[]) {
        for (const { candidate, sdpMid, sdpmLineIndex } of candidates) {
            this.#connection.addRemoteCandidate(candidate, this.#mediaIdFor(sdpMid, sdpmLineIndex));
        }
    }

    #mediaIdFor(sdpMid: string | null, sdpmLineIndex: number | null): string {
        if (sdpMid !== null) {
            return sdpMid;
        }

        const mids = [...(this.#connection.remoteDescription()?.sdp ?? "").matchAll(/^a=mid:(.*)$/gm)].map(match =>
            match[1].trim(),
        );

        const named = sdpmLineIndex === null ? undefined : mids[sdpmLineIndex];
        if (named === undefined) {
            throw new InternalError(
                `ICE candidate names neither a media id nor a section of the ${mids.length} the remote description ` +
                    `carries (index ${sdpmLineIndex}), so there is nothing to attach it to`,
            );
        }

        return named;
    }

    /**
     * The candidates gathered so far, which a case sends to the provider. Gathering is continuous, so
     * a caller takes what there is rather than waiting for an end that a host-only connection does not
     * announce.
     */
    take(): WebRtcIceCandidate[] {
        return this.#localCandidates.splice(0);
    }

    /** Whether the connection has reported `connected`, waiting up to `timeout` for it to do so. */
    async connected(timeout: Duration): Promise<boolean> {
        const endsAt = Time.nowUs + timeout;
        do {
            if (this.#everConnected) {
                return true;
            }
            if (this.#state === "failed" || this.#state === "closed") {
                return false;
            }
            await Time.sleep("webrtc connection", Millis(100));
        } while (Time.nowUs < endsAt);

        return this.#everConnected;
    }

    close() {
        this.#channel?.close();
        this.#connection.close();
    }
}

/**
 * Releases what the library holds for the whole process.
 *
 * Belongs to the end of the run rather than to a case: it tears down state every peer shares, so a
 * case that called it would pull the library out from under the next one. It also must not run from a
 * test hook — the process dies there before the runner reports, taking a whole leg's summary with it —
 * so the harness's own shutdown is where it goes.
 */
export function closeWebRtc() {
    cleanup();
}
