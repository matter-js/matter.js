/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Duration, Logger, MatterError, Millis, Seconds, Time, TimeoutError, type Timer } from "@matter/general";
import type { CoapClient } from "../coap/CoapClient.js";
import { LeadKa } from "./LeadKa.js";
import { LeadPet } from "./LeadPet.js";

const logger = Logger.get("Commissioner");

/** Thrown by {@link Commissioner.petition} when the Border Router explicitly rejects the petition. */
export class CommissionerRejectedError extends MatterError {
    constructor() {
        super("Commissioner petition rejected by Border Router");
        this.name = "CommissionerRejectedError";
    }
}

/** Thrown by {@link Commissioner.petition} when the petition is still pending after one retry. */
export class CommissionerTimeoutError extends TimeoutError {
    constructor() {
        super("Commissioner petition timed out (still pending after retry)");
        this.name = "CommissionerTimeoutError";
    }
}

/** Thrown by {@link Commissioner.keepAlive} when the Border Router answers with a non-accept state. */
export class CommissionerKeepAliveError extends MatterError {}

export interface CommissionerOpts {
    /** Override the 30s pending-retry delay. Intended for testing. */
    pendingRetryDelayMs?: number;
}

/**
 * Thread MeshCoP Commissioner — petitions for, maintains, and releases a
 * commissioner session over an already-connected CoAP transport.
 *
 * Callers should prefer {@link Commissioner.withSession} for the full
 * petition → keep-alive → release lifecycle. Use `petition`/`keepAlive`/`release`
 * directly only when finer-grained control is needed.
 */
export class Commissioner {
    static readonly COMMISSIONER_ID = "matter-server";
    static readonly #KA_INTERVAL = Seconds(40);
    static readonly #PENDING_RETRY_DELAY = Seconds(30);

    readonly #coap: CoapClient;
    readonly #pendingRetryDelay: Duration;

    /**
     * @param coap - CoAP transport connected to the target Border Router.
     * @param opts - Optional overrides (e.g. `pendingRetryDelayMs` for tests).
     */
    constructor(coap: CoapClient, opts?: CommissionerOpts) {
        this.#coap = coap;
        this.#pendingRetryDelay =
            opts?.pendingRetryDelayMs !== undefined
                ? Millis(opts.pendingRetryDelayMs)
                : Commissioner.#PENDING_RETRY_DELAY;
    }

    /**
     * Send a MeshCoP `COMM_PET` (commissioner petition) request.
     *
     * When the BR responds `pending`, retries once after `pendingRetryDelayMs`
     * (default 30 s). Accepts on the first `accept` response.
     *
     * @returns The commissioner session ID assigned by the Border Router.
     * @throws {@link CommissionerRejectedError} when the BR returns `reject` on
     *   the initial petition or on the retry.
     * @throws {@link CommissionerTimeoutError} when the BR returns `pending` on
     *   both the initial petition and the retry.
     * @throws `Error` on CoAP transport or TLV parse failure.
     */
    async petition(): Promise<number> {
        const response = await this.#coap.request({
            type: "CON",
            code: "0.02",
            uriPath: ["c", "cp"],
            payload: LeadPet.buildRequest(Commissioner.COMMISSIONER_ID),
        });

        logger.debug(`COMM_PET response code=${response.code} payloadLen=${response.payload.byteLength}`);
        const parsed = LeadPet.parseResponse(response.payload);

        if (parsed.state === "accept") {
            return parsed.sessionId!;
        }

        if (parsed.state === "reject") {
            throw new CommissionerRejectedError();
        }

        // pending: wait and retry once
        await Time.sleep("commissioner-pending-retry", this.#pendingRetryDelay);

        const retryResponse = await this.#coap.request({
            type: "CON",
            code: "0.02",
            uriPath: ["c", "cp"],
            payload: LeadPet.buildRequest(Commissioner.COMMISSIONER_ID),
        });

        const retryParsed = LeadPet.parseResponse(retryResponse.payload);

        if (retryParsed.state === "accept") {
            return retryParsed.sessionId!;
        }

        if (retryParsed.state === "reject") {
            throw new CommissionerRejectedError();
        }

        throw new CommissionerTimeoutError();
    }

    /**
     * Send a MeshCoP `COMM_KA` (commissioner keep-alive) request.
     *
     * Must be called periodically (typically every ~40 s) while the session is
     * active; the BR will revoke the session if no keep-alive is received within
     * its timeout window. Prefer {@link Commissioner.withSession}, which schedules
     * keep-alives automatically.
     *
     * @param sessionId - Session ID returned by {@link petition}.
     * @throws {@link CommissionerKeepAliveError} when the BR rejects the keep-alive; propagates CoAP errors.
     */
    async keepAlive(sessionId: number): Promise<void> {
        const response = await this.#coap.request({
            type: "CON",
            code: "0.02",
            uriPath: ["c", "ca"],
            payload: LeadKa.buildRequest(sessionId),
        });

        const parsed = LeadKa.parseResponse(response.payload);
        if (parsed.state !== "accept") {
            throw new CommissionerKeepAliveError(`Commissioner keep-alive rejected: state=${parsed.state}`);
        }
    }

    /**
     * Resign the commissioner session via a MeshCoP `COMM_KA` (keep-alive) with a
     * rejecting State TLV. Thread has no dedicated release URI on the Border Agent
     * channel; a keep-alive carrying `State=reject` is how a commissioner relinquishes.
     *
     * Best-effort — CoAP errors are logged at `warn` level and swallowed so a
     * failed resign does not block teardown. Dropping the DTLS session also makes
     * the Border Agent revoke the role, so a lost resign is harmless.
     *
     * @param sessionId - Session ID returned by {@link petition}.
     */
    async release(sessionId: number): Promise<void> {
        try {
            const response = await this.#coap.request({
                type: "CON",
                code: "0.02",
                uriPath: ["c", "ca"],
                payload: LeadKa.buildRequest(sessionId, "reject"),
            });
            // CoapClient resolves 4.xx/5.xx responses rather than throwing, so a rejected
            // resign is only visible by inspecting the response code.
            if (!response.code.startsWith("2.")) {
                logger.warn(`Commissioner release got non-success CoAP response ${response.code} (best-effort)`);
            }
        } catch (err) {
            logger.warn("Commissioner release failed (best-effort):", err);
        }
    }

    /**
     * Run `fn` inside a commissioner session, managing petition, keep-alive, and
     * release automatically.
     *
     * Keep-alive requests fire every ~40 s while `fn` is executing. The session is
     * released in a `finally` block regardless of whether `fn` resolves or rejects.
     *
     * @param fn - Async callback receiving the active session ID.
     * @returns The value resolved by `fn`.
     * @throws {@link CommissionerRejectedError} or {@link CommissionerTimeoutError}
     *   when the petition fails (before `fn` is invoked).
     */
    async withSession<T>(fn: (sessionId: number) => Promise<T>): Promise<T> {
        const sessionId = await this.petition();
        const kaInterval: Timer = Time.getPeriodicTimer("commissioner-keepalive", Commissioner.#KA_INTERVAL, () => {
            void this.keepAlive(sessionId).catch(err => {
                logger.warn("Commissioner keep-alive error:", err);
            });
        }).start();

        try {
            return await fn(sessionId);
        } finally {
            kaInterval.stop();
            await this.release(sessionId);
        }
    }
}
