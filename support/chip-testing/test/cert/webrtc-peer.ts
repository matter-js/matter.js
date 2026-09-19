/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration, InternalError, Millis, Time } from "@matter/main";
import type { WebRtcIceCandidate } from "@matter/testing";
import { fork, type ChildProcess } from "node:child_process";

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
 * The connection itself lives in a child process. `node-datachannel` keeps a process alive once a
 * connection has run, and its only release is a process-wide `cleanup()` that kills a process still
 * doing work; the certification specs share one process and report at the end of it, so in-process
 * either the run never exits or it dies before its verdict — both observed in CI. A child process has
 * neither problem: it holds one connection and nothing else, and it goes away with the case.
 *
 * Nothing here interprets media. Reaching `connected` is the whole purpose, because that is what the
 * plan asks the provider to report.
 */
export class WebRtcPeer {
    readonly #name: string;
    readonly #child: ChildProcess;
    readonly #pending = new Map<number, { resolve: (value: unknown) => void; reject: (cause: Error) => void }>();
    #nextId = 1;
    #state = "new";
    #everConnected = false;
    #remote?: string;
    #closed = false;

    constructor(name = "dut") {
        this.#name = name;
        this.#child = fork(new URL("webrtc-peer-child.js", import.meta.url), { stdio: "inherit" });

        this.#child.on("message", (message: { id: number; result?: unknown; error?: string }) => {
            const pending = this.#pending.get(message.id);
            this.#pending.delete(message.id);
            if (message.error !== undefined) {
                pending?.reject(new InternalError(`WebRTC peer "${name}": ${message.error}`));
            } else {
                pending?.resolve(message.result);
            }
        });

        this.#child.on("exit", () => {
            for (const [, pending] of this.#pending) {
                pending.reject(new InternalError(`WebRTC peer "${name}" exited with work outstanding`));
            }
            this.#pending.clear();
        });
    }

    /** What the connection reported when last asked. */
    get state() {
        return this.#state;
    }

    /** Answers the provider's offer, and returns the answer to send back. */
    async answer(offer: string): Promise<string> {
        return (await this.#send("answer", { sdp: offer })) as string;
    }

    /** Creates the offer for a session this side initiates, for the provider to answer. */
    async offer(): Promise<string> {
        return (await this.#send("offer")) as string;
    }

    /**
     * Accepts the provider's answer to {@link offer}.
     *
     * chip's camera answers `a=setup:actpass`, which an answer may not carry — RFC 8842 § 5.3 has the
     * answerer follow RFC 4145 § 4.1, whose table leaves an answerer `active` or `passive` and never
     * `actpass`, that being the offer's way of leaving the choice open. libdatachannel refuses such an
     * answer outright ("Illegal role actpass in remote answer description"), so this settles the role
     * the way the specification says the answerer should have: the answerer becomes the DTLS client.
     * Reported upstream.
     *
     * Reports whether it had to, so a case can say so in its evidence rather than certifying a
     * connection built on an answer the harness altered.
     */
    async accept(answer: string): Promise<{ rewroteRole: boolean }> {
        const settled = answer.replaceAll("a=setup:actpass", "a=setup:active");
        await this.#send("accept", { sdp: settled });
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
    async add(candidates: readonly WebRtcIceCandidate[]) {
        if (!candidates.length) {
            return;
        }

        await this.#refresh();

        await this.#send("add", {
            candidates: candidates.map(({ candidate, sdpMid, sdpmLineIndex }) => ({
                candidate,
                mid: this.#mediaIdFor(sdpMid, sdpmLineIndex),
            })),
        });
    }

    /**
     * The candidates gathered so far, which a case sends to the provider. Gathering is continuous, so
     * a caller takes what there is rather than waiting for an end that a host-only connection does not
     * announce.
     */
    async take(): Promise<WebRtcIceCandidate[]> {
        const gathered = (await this.#send("take")) as { candidate: string; mid: string }[];

        // The library names the media section; the index of that section is not ours to invent, and the
        // field is nullable for exactly that case
        return gathered.map(({ candidate, mid }) => ({ candidate, sdpMid: mid, sdpmLineIndex: null }));
    }

    /** Whether the connection has reported `connected`, waiting up to `timeout` for it to do so. */
    async connected(timeout: Duration): Promise<boolean> {
        const endsAt = Time.nowUs + timeout;
        do {
            // A closed peer answers nothing further, and what it reached is already known
            if (this.#closed) {
                return this.#everConnected;
            }

            await this.#refresh();

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

    /** Closes the connection and the process holding it. */
    async close() {
        if (this.#closed) {
            return;
        }
        this.#closed = true;

        try {
            await this.#send("close", {}, true);
        } catch (e) {
            // The child releases the library and exits as it answers, so a lost answer here says only
            // that it went away first
            void e;
        }

        this.#child.kill();
    }

    async #refresh() {
        const reported = (await this.#send("state")) as { state: string; everConnected: boolean; remote?: string };
        this.#state = reported.state;
        this.#everConnected ||= reported.everConnected;
        this.#remote = reported.remote;
    }

    #mediaIdFor(sdpMid: string | null, sdpmLineIndex: number | null): string {
        if (sdpMid !== null) {
            return sdpMid;
        }

        const mids = [...(this.#remote ?? "").matchAll(/^a=mid:(.*)$/gm)].map(match => match[1].trim());
        const named = sdpmLineIndex === null ? undefined : mids[sdpmLineIndex];
        if (named === undefined) {
            throw new InternalError(
                `ICE candidate names neither a media id nor a section of the ${mids.length} the remote description ` +
                    `carries (index ${sdpmLineIndex}), so there is nothing to attach it to`,
            );
        }

        return named;
    }

    async #send(op: string, payload: object = {}, closing = false) {
        if (this.#closed && !closing) {
            throw new InternalError(`WebRTC peer "${this.#name}" was asked to ${op} after it closed`);
        }

        const id = this.#nextId++;
        return new Promise<unknown>((resolve, reject) => {
            this.#pending.set(id, { resolve, reject });
            this.#child.send({ id, op, ...payload }, error => {
                if (error) {
                    this.#pending.delete(id);
                    reject(
                        new InternalError(`WebRTC peer "${this.#name}" could not be asked to ${op}: ${error.message}`),
                    );
                }
            });
        });
    }
}
