/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "@matter/main";
import type { CoapClient } from "../coap/CoapClient.js";
import { MeshCopTlvType } from "../dataset/meshcopTlvTypes.js";
import { BasicTlv } from "../tlv/BasicTlvCodec.js";
import { LeadKa } from "./LeadKa.js";
import { LeadPet } from "./LeadPet.js";

const logger = Logger.get("Commissioner");

/** Thrown by {@link Commissioner.petition} when the Border Router explicitly rejects the petition. */
export class CommissionerRejectedError extends Error {
    constructor() {
        super("Commissioner petition rejected by Border Router");
        this.name = "CommissionerRejectedError";
    }
}

/** Thrown by {@link Commissioner.petition} when the petition is still pending after one retry. */
export class CommissionerTimeoutError extends Error {
    constructor() {
        super("Commissioner petition timed out (still pending after retry)");
        this.name = "CommissionerTimeoutError";
    }
}

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
    static readonly #KA_INTERVAL_MS = 40_000;
    static readonly #PENDING_RETRY_DELAY_MS = 30_000;

    readonly #coap: CoapClient;
    readonly #pendingRetryDelayMs: number;

    /**
     * @param coap - CoAP transport connected to the target Border Router.
     * @param opts - Optional overrides (e.g. `pendingRetryDelayMs` for tests).
     */
    constructor(coap: CoapClient, opts?: CommissionerOpts) {
        this.#coap = coap;
        this.#pendingRetryDelayMs = opts?.pendingRetryDelayMs ?? Commissioner.#PENDING_RETRY_DELAY_MS;
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

        logger.debug(`[ThreadDiag] COMM_PET response code=${response.code} payloadLen=${response.payload.length}`);
        const parsed = LeadPet.parseResponse(response.payload);

        if (parsed.state === "accept") {
            return parsed.sessionId!;
        }

        if (parsed.state === "reject") {
            throw new CommissionerRejectedError();
        }

        // pending: wait and retry once
        await new Promise<void>(r => setTimeout(r, this.#pendingRetryDelayMs));

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
     * @throws `Error` when the BR rejects the keep-alive or the CoAP request fails.
     */
    async keepAlive(sessionId: number): Promise<void> {
        const response = await this.#coap.request({
            type: "CON",
            code: "0.02",
            uriPath: ["c", "ka"],
            payload: LeadKa.buildRequest(sessionId),
        });

        const parsed = LeadKa.parseResponse(response.payload);
        if (parsed.state !== "accept") {
            throw new Error(`Commissioner keep-alive rejected: state=${parsed.state}`);
        }
    }

    /**
     * Send a MeshCoP `COMM_REL` (commissioner release) request.
     *
     * Best-effort — CoAP errors are logged at `warn` level and swallowed so a
     * failed release does not block teardown. The BR will expire the session on
     * its own if the release is lost.
     *
     * @param sessionId - Session ID returned by {@link petition}.
     */
    async release(sessionId: number): Promise<void> {
        try {
            // COMM_REL requires both COMMISSIONER_SESSION_ID and COMMISSIONER_ID (Thread spec Table 8-16).
            const sessionBytes = new Uint8Array(2);
            sessionBytes[0] = (sessionId >> 8) & 0xff;
            sessionBytes[1] = sessionId & 0xff;
            const releasePayload = BasicTlv.encode([
                { type: MeshCopTlvType.COMMISSIONER_SESSION_ID, value: sessionBytes },
                { type: MeshCopTlvType.COMMISSIONER_ID, value: new TextEncoder().encode(Commissioner.COMMISSIONER_ID) },
            ]);
            await this.#coap.request({
                type: "CON",
                code: "0.02",
                uriPath: ["c", "cr"],
                payload: releasePayload,
            });
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
        const kaInterval = setInterval(() => {
            void this.keepAlive(sessionId).catch(err => {
                logger.warn("Commissioner keep-alive error:", err);
            });
        }, Commissioner.#KA_INTERVAL_MS);

        try {
            return await fn(sessionId);
        } finally {
            clearInterval(kaInterval);
            await this.release(sessionId);
        }
    }
}
