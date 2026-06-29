/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "@matter/main";
import type { DtlsSocket } from "../dtls/socket/DtlsSocket.js";
import { CoapMessage } from "./CoapMessage.js";

const logger = Logger.get("CoapClient");

/** Thrown when a CON request exhausts MAX_RETRANSMIT without receiving an ACK,
 *  or when an empty ACK is received but no separate response arrives within
 *  {@link SEPARATE_RESPONSE_TIMEOUT_MS}. */
export class CoapTimeoutError extends Error {
    constructor(messageId: number) {
        super(`CoAP CON messageId=${messageId} timed out after MAX_RETRANSMIT`);
        this.name = "CoapTimeoutError";
    }
}

/** RFC 7252 §4.2 retransmission constants. */
const RFC_ACK_TIMEOUT_MS = 2_000;
const RFC_ACK_RANDOM_FACTOR = 1.5;
const MAX_RETRANSMIT = 4;
/** Wait this long after an empty ACK (RFC 7252 §5.2.2 separate response) for the
 *  matching response message to arrive. Spec EXCHANGE_LIFETIME is 247s; we use a
 *  much tighter ceiling because Thread MeshCoP transactions are local-network
 *  fast paths — a no-show after 30s indicates a dropped response, not network
 *  delay. */
const SEPARATE_RESPONSE_TIMEOUT_MS = 30_000;

export interface CoapClientOpts {
    /** Override ACK_TIMEOUT for testing. Default: 2000ms per RFC 7252 §4.2. */
    ackTimeoutMs?: number;
    /** Override the separate-response wait window. Default: 30000ms. */
    separateResponseTimeoutMs?: number;
}

type PendingState = {
    resolve: (msg: CoapMessage) => void;
    reject: (err: Error) => void;
    tokenHex: string;
    onEmptyAck: () => void;
};

type Listener = {
    uriPath: string[];
    handler: (msg: CoapMessage) => void;
};

function pathsEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

function tokenHex(token: Uint8Array): string {
    let out = "";
    for (const b of token) {
        out += b.toString(16).padStart(2, "0");
    }
    return out;
}

export class CoapClient {
    #messageId = Math.floor(Math.random() * 0x10000);
    #socket: DtlsSocket;
    #ackTimeoutMs: number;
    #separateResponseTimeoutMs: number;
    /** Tracks the per-message-id retransmit slot. Removed once the BR ACKs the
     *  request — either with a piggybacked response or an empty ACK announcing
     *  a separate response. */
    #pendingByMsgId = new Map<number, PendingState>();
    /** Tracks the per-token response correlation slot. Removed only when the
     *  response actually arrives (or the separate-response wait times out). */
    #pendingByToken = new Map<string, PendingState>();
    #listeners = new Set<Listener>();

    constructor(socket: DtlsSocket, opts?: CoapClientOpts) {
        this.#socket = socket;
        this.#ackTimeoutMs = opts?.ackTimeoutMs ?? RFC_ACK_TIMEOUT_MS;
        this.#separateResponseTimeoutMs = opts?.separateResponseTimeoutMs ?? SEPARATE_RESPONSE_TIMEOUT_MS;
        void this.#runRecvLoop();
    }

    async request(opts: {
        type: "CON" | "NON";
        code: string;
        uriPath: string[];
        payload?: Uint8Array;
    }): Promise<CoapMessage> {
        const messageId = this.#nextMessageId();
        const token = this.#randomToken();
        const msg: CoapMessage = {
            type: opts.type,
            code: opts.code,
            messageId,
            token,
            uriPath: opts.uriPath,
            payload: opts.payload ?? new Uint8Array(),
        };

        if (opts.type === "NON") {
            await this.#socket.send(CoapMessage.encode(msg));
            // NON messages receive no ACK per RFC 7252 §4.3; return a synthetic sentinel.
            // Callers must not inspect code/type of this response.
            return { type: "NON", code: "0.00", messageId, token, payload: new Uint8Array() };
        }

        return this.#sendCon(msg);
    }

    listen(uriPath: string[], handler: (msg: CoapMessage) => void): () => void {
        const entry: Listener = { uriPath: [...uriPath], handler };
        this.#listeners.add(entry);
        return () => {
            this.#listeners.delete(entry);
        };
    }

    async close(): Promise<void> {
        this.#listeners.clear();
        await this.#socket.close();
    }

    async #sendCon(msg: CoapMessage): Promise<CoapMessage> {
        if (this.#pendingByMsgId.has(msg.messageId)) {
            throw new Error(`CoapClient: messageId collision at ${msg.messageId} — too many concurrent CON requests`);
        }
        const reqTokenHex = tokenHex(msg.token);
        if (this.#pendingByToken.has(reqTokenHex)) {
            throw new Error(`CoapClient: token collision for ${reqTokenHex}`);
        }

        const encoded = CoapMessage.encode(msg);

        return new Promise<CoapMessage>((resolve, reject) => {
            let retransmitTimer: ReturnType<typeof setTimeout> | undefined;
            let separateTimer: ReturnType<typeof setTimeout> | undefined;
            let attempt = 0;

            const cleanup = (): void => {
                if (retransmitTimer !== undefined) {
                    clearTimeout(retransmitTimer);
                    retransmitTimer = undefined;
                }
                if (separateTimer !== undefined) {
                    clearTimeout(separateTimer);
                    separateTimer = undefined;
                }
                this.#pendingByMsgId.delete(msg.messageId);
                this.#pendingByToken.delete(reqTokenHex);
            };

            const state: PendingState = {
                resolve: (response: CoapMessage) => {
                    cleanup();
                    resolve(response);
                },
                reject: (err: Error) => {
                    cleanup();
                    reject(err);
                },
                tokenHex: reqTokenHex,
                onEmptyAck: () => {
                    // Stop retransmitting; the BR has accepted the request and will deliver
                    // the response in a separate CON/NON message with the same token.
                    if (retransmitTimer !== undefined) {
                        clearTimeout(retransmitTimer);
                        retransmitTimer = undefined;
                    }
                    this.#pendingByMsgId.delete(msg.messageId);
                    separateTimer = setTimeout(() => {
                        state.reject(new CoapTimeoutError(msg.messageId));
                    }, this.#separateResponseTimeoutMs);
                },
            };

            const scheduleRetransmit = (delayMs: number): void => {
                retransmitTimer = setTimeout(() => {
                    retransmitTimer = undefined;
                    if (!this.#pendingByMsgId.has(msg.messageId)) return;
                    if (attempt >= MAX_RETRANSMIT) {
                        state.reject(new CoapTimeoutError(msg.messageId));
                        return;
                    }
                    attempt++;
                    void this.#socket.send(encoded).catch(() => {});
                    scheduleRetransmit(Math.min(delayMs * 2, this.#ackTimeoutMs * 2 ** MAX_RETRANSMIT));
                }, delayMs);
            };

            this.#pendingByMsgId.set(msg.messageId, state);
            this.#pendingByToken.set(reqTokenHex, state);

            const initialDelay = this.#ackTimeoutMs * (1 + Math.random() * (RFC_ACK_RANDOM_FACTOR - 1.0));
            void this.#socket
                .send(encoded)
                .then(() => {
                    scheduleRetransmit(initialDelay);
                })
                .catch(err => {
                    state.reject(err instanceof Error ? err : new Error(String(err)));
                });
        });
    }

    async #runRecvLoop(): Promise<void> {
        let socketError: Error | undefined;
        try {
            for (;;) {
                let bytes: Uint8Array;
                try {
                    bytes = await this.#socket.recv();
                } catch (err) {
                    socketError = err instanceof Error ? err : new Error(String(err));
                    break;
                }

                let msg: CoapMessage;
                try {
                    msg = CoapMessage.decode(bytes);
                } catch {
                    continue;
                }

                await this.#dispatchInbound(msg);
            }
        } finally {
            const err = socketError ?? new Error("CoapClient: socket closed");
            // Reject all outstanding requests (both maps reference the same PendingState entries).
            for (const state of this.#pendingByToken.values()) {
                state.reject(err);
            }
            this.#pendingByMsgId.clear();
            this.#pendingByToken.clear();
        }
    }

    async #dispatchInbound(msg: CoapMessage): Promise<void> {
        if (msg.type === "ACK") {
            const state = this.#pendingByMsgId.get(msg.messageId);
            if (state === undefined) {
                // Stray ACK (duplicate or for a request we no longer track) — ignore.
                return;
            }
            const isEmptyAck = msg.code === "0.00" && msg.payload.length === 0;
            if (isEmptyAck) {
                // Separate response coming.
                state.onEmptyAck();
                return;
            }
            // Piggybacked response.
            state.resolve(msg);
            return;
        }

        if (msg.type === "RST") {
            const state = this.#pendingByMsgId.get(msg.messageId);
            if (state !== undefined) {
                state.reject(new Error(`CoAP RST received for messageId=${msg.messageId}`));
            }
            return;
        }

        // CON or NON. Check token first so a separate response is routed back to the
        // originating #sendCon call regardless of which Uri-Path the BR replied on.
        const inboundTokenHex = tokenHex(msg.token);
        const pending = this.#pendingByToken.get(inboundTokenHex);
        if (pending !== undefined) {
            if (msg.type === "CON") {
                await this.#sendEmptyAck(msg.messageId);
            }
            pending.resolve(msg);
            return;
        }

        // Not a response to any pending request. ACK incoming CONs (RFC 7252 §4.3)
        // and dispatch to listeners (this is the multicast diagnostic-answer path).
        if (msg.type === "CON") {
            await this.#sendEmptyAck(msg.messageId);
        }
        this.#dispatchToListeners(msg);
    }

    async #sendEmptyAck(messageId: number): Promise<void> {
        // RFC 7252 §4.1: Empty messages have Code 0.00, no Token, no options, no payload.
        const ack: CoapMessage = {
            type: "ACK",
            code: "0.00",
            messageId,
            token: new Uint8Array(),
            payload: new Uint8Array(),
        };
        try {
            await this.#socket.send(CoapMessage.encode(ack));
        } catch (err) {
            logger.debug(`Failed to send ACK for messageId=${messageId}:`, err);
        }
    }

    #dispatchToListeners(msg: CoapMessage): void {
        const inbound = msg.uriPath ?? [];
        const uri = inbound.length > 0 ? `/${inbound.join("/")}` : "(none)";
        let delivered = 0;
        for (const listener of this.#listeners) {
            if (!pathsEqual(listener.uriPath, inbound)) continue;
            delivered++;
            try {
                listener.handler(msg);
            } catch (err) {
                logger.warn("CoapClient listener handler threw:", err);
            }
        }
        if (delivered === 0) {
            logger.debug(
                `CoAP inbound consumed by no request or listener: uri=${uri} type=${msg.type} code=${msg.code} payloadLen=${msg.payload.length}`,
            );
        }
    }

    #nextMessageId(): number {
        const id = this.#messageId;
        this.#messageId = (this.#messageId + 1) & 0xffff;
        return id;
    }

    #randomToken(): Uint8Array {
        const token = new Uint8Array(4);
        crypto.getRandomValues(token);
        return token;
    }
}
