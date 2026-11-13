/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Duration, InternalError, Time, Timestamp } from "@matter/general";
import { PeerAddress } from "@matter/protocol";
import { OTA_PROGRESS_TIMEOUT, OtaUpdateStatus } from "./OtaProgress.js";

/**
 * One update flow of a node: a QueryImage, the offer the OTA provider makes under one update token, and how far the
 * node gets with that offer.  An ApplyUpdateRequest under an unknown update token starts an attempt too.
 *
 * An offer allows the node to apply its version, see {@link applyAllowed}.
 *
 * The attempt lives on after a failed or cancelled transfer, because the node may retry under the same update token.
 * The SoftwareUpdateManager ends it.  The OTA provider reports transfer activity with
 * {@link OtaUpdateAttempt.touch} and may watch the end with {@link OtaUpdateAttempt.onEnd}.
 *
 * @see {@link MatterSpecification.v161.Core} § 11.20.3.4.1
 */
export class OtaUpdateAttempt {
    #token?: Bytes;
    #version?: number;
    #applyAllowed = false;
    #status = OtaUpdateStatus.Querying;
    #lastActivity: Timestamp = Time.nowMs;
    #applyDelay?: Duration;
    #answered = false;
    #ended = false;
    readonly #disposers = new Array<() => void>();

    constructor(readonly peerAddress: PeerAddress) {}

    /** The update token of the offer; unset while the query made no offer. */
    get token() {
        return this.#token;
    }

    /** The offered version; unset while the query made no offer. */
    get version() {
        return this.#version;
    }

    /** The node may apply the offered version under the token, see `SoftwareUpdateManager.applyUpdate()`. */
    get applyAllowed() {
        return this.#applyAllowed;
    }

    get status() {
        return this.#status;
    }

    /** A status change or BDX transfer progress. */
    get lastActivity() {
        return this.#lastActivity;
    }

    /** With `Applying`, the delay the device waits out before it applies; progress is not expected meanwhile. */
    get applyDelay() {
        return this.#applyDelay;
    }

    /** The provider answered the query with this offer.  Only an answered attempt moves a queued update. */
    get answered() {
        return this.#answered;
    }

    get ended() {
        return this.#ended;
    }

    /** Records the offer, once; it allows the apply. */
    makeOffer(token: Bytes, version: number) {
        if (this.#token !== undefined) {
            throw new InternalError(`${this.toString()} already made an offer`);
        }
        this.#token = token;
        this.#version = version;
        this.#applyAllowed = true;
        this.#lastActivity = Time.nowMs;
    }

    /** The node may no longer apply the offered version, as its consent was removed. */
    disallowApply() {
        this.#applyAllowed = false;
    }

    /** Records that the provider answered the query with the offer. */
    answer() {
        this.#answered = true;
    }

    /** Records a status; `applyDelay` only counts with `Applying`. */
    setStatus(status: OtaUpdateStatus, applyDelay?: Duration) {
        this.#status = status;
        this.#applyDelay = status === OtaUpdateStatus.Applying ? applyDelay : undefined;
        this.#lastActivity = Time.nowMs;
    }

    /** Records activity that is no status change, such as BDX transfer progress. */
    touch() {
        this.#lastActivity = Time.nowMs;
    }

    /** The node showed no activity for {@link OTA_PROGRESS_TIMEOUT}, plus the delay of an apply. */
    isStale(now: Timestamp) {
        return this.#lastActivity + (this.#applyDelay ?? 0) + OTA_PROGRESS_TIMEOUT < now;
    }

    /** Runs `disposer` when the attempt ends, at once when it already ended. */
    onEnd(disposer: () => void) {
        if (this.#ended) {
            disposer();
        } else {
            this.#disposers.push(disposer);
        }
    }

    /** Ends the attempt and runs its disposers.  Ending it again does nothing. */
    end() {
        if (this.#ended) {
            return;
        }
        this.#ended = true;
        for (const disposer of this.#disposers.splice(0)) {
            disposer();
        }
    }

    toString() {
        const token = this.#token === undefined ? "" : ` (${Bytes.toHex(this.#token)})`;
        const version = this.#version === undefined ? "" : ` to version ${this.#version}`;
        return `OTA update${version} of node ${this.peerAddress.toString()}${token}`;
    }
}

/**
 * The running {@link OtaUpdateAttempt}s of all nodes.  A node has at most one answered attempt, as the node follows the
 * update token it received last; the SoftwareUpdateManager ends the previous one, see {@link answer}.
 */
export class OtaUpdateAttempts {
    readonly #attempts = new Set<OtaUpdateAttempt>();

    /** Starts an attempt, for a QueryImage that just arrived or an apply under an unknown update token. */
    begin(peerAddress: PeerAddress) {
        const attempt = new OtaUpdateAttempt(peerAddress);
        this.#attempts.add(attempt);
        attempt.onEnd(() => this.#attempts.delete(attempt));
        return attempt;
    }

    /** Marks the attempt answered and returns the node's other attempts with an offer, which it replaces. */
    answer(attempt: OtaUpdateAttempt) {
        attempt.answer();
        return this.offered(attempt.peerAddress).filter(other => other !== attempt);
    }

    /** The node's running attempt with an offer under `token`. */
    find(peerAddress: PeerAddress, token: Bytes) {
        return this.of(peerAddress).find(
            attempt => attempt.token !== undefined && Bytes.areEqual(attempt.token, token),
        );
    }

    /** The node's running attempts with an offer. */
    offered(peerAddress: PeerAddress) {
        return this.of(peerAddress).filter(attempt => attempt.token !== undefined);
    }

    /** The node's running attempts, also those whose query made no offer yet. */
    of(peerAddress: PeerAddress) {
        return [...this.#attempts].filter(attempt => PeerAddress.is(attempt.peerAddress, peerAddress));
    }

    /** All running attempts. */
    all() {
        return [...this.#attempts];
    }
}
