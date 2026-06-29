/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { p256 } from "@noble/curves/nist.js";
import { randomBytes } from "node:crypto";
import { type Socket, createSocket } from "node:dgram";
import { DtlsClient, type DtlsClientConfig } from "../handshake/DtlsClient.js";
import { ContentType } from "../record/ContentType.js";
import { type DtlsCipherState } from "../record/DtlsCipherState.js";
import { DTLS_HEADER_LEN, DtlsRecord } from "../record/DtlsRecord.js";
import type { DtlsConnectOpts } from "./DtlsConnectOpts.js";
import { DtlsRetransmitTimer } from "./DtlsRetransmitTimer.js";
import type { DtlsSocket } from "./DtlsSocket.js";

const DEFAULT_INITIAL_RETRANSMIT_MS = 1000;
const DEFAULT_MAX_RETRANSMIT_MS = 60_000;
const DEFAULT_MAX_RETRANSMITS = 5;
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_MTU = 1280;

const N = p256.Point.Fn.ORDER;

/**
 * Optional hooks injected by tests so the socket runs against fake timers /
 * a fake `dgram.Socket`. The defaults wire to Node globals.
 */
export interface NobleDtlsSocketHooks {
    /** Inject a pre-built UDP socket (skips internal `dgram.createSocket`). */
    createUdpSocket?: (type: "udp4" | "udp6") => Socket;
    /** Override `setTimeout` (used for retransmit and connect-deadline timers). */
    setTimeoutImpl?: (cb: () => void, ms: number) => unknown;
    /** Override `clearTimeout`. */
    clearTimeoutImpl?: (handle: unknown) => void;
}

const ALERT_LEVEL_WARNING = 1;
const ALERT_DESC_CLOSE_NOTIFY = 0;

function inferUdpType(address: string, hint?: "udp4" | "udp6"): "udp4" | "udp6" {
    if (hint !== undefined) {
        return hint;
    }
    return address.includes(":") ? "udp6" : "udp4";
}

function defaultRandom(): Uint8Array {
    return Uint8Array.from(randomBytes(32));
}

function concatBuffers(parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
        out.set(p, off);
        off += p.length;
    }
    return out;
}

function defaultEphemeralScalar(): bigint {
    // Sample 32 bytes and reduce mod (n-1), then add 1 to land in [1, n-1].
    // 256 bits with mod-(n-1) bias is < 2^-128 — acceptable for transient ephemerals.
    let v = 0n;
    const buf = randomBytes(32);
    for (const byte of buf) {
        v = (v << 8n) | BigInt(byte);
    }
    return (v % (N - 1n)) + 1n;
}

/**
 * UDP-bound DTLS 1.2 + EC-JPAKE client. Drives a {@link DtlsClient} state machine
 * over a Node `dgram.Socket`, applies RFC 6347 §4.2.4 retransmit on the handshake
 * flights, then exposes a plaintext `send`/`recv` surface for application data
 * (CoAP in Phase 4).
 *
 * Lifecycle: caller constructs with {@link DtlsConnectOpts}, awaits
 * {@link connect()} (which throws on handshake failure / timeout / give-up),
 * then uses {@link send} and {@link recv} until {@link close}. `close()` is
 * idempotent and will best-effort send a close_notify alert.
 */
export class NobleDtlsSocket implements DtlsSocket {
    readonly #opts: DtlsConnectOpts;
    readonly #hooks: NobleDtlsSocketHooks;
    readonly #udpType: "udp4" | "udp6";

    #udp: Socket | undefined;
    #client: DtlsClient | undefined;
    #retransmit: DtlsRetransmitTimer | undefined;

    /** Established cipher state (snapshot of the DtlsClient's after handshake). */
    #cipherState: DtlsCipherState | undefined;
    #connected = false;
    #closed = false;
    #lastError: Error | undefined;

    /** Connect-deadline timer handle. */
    #connectDeadline: unknown;

    /** Decrypted application-data plaintexts waiting for a recv() caller. */
    readonly #recvQueue = new Array<Uint8Array>();
    /** Pending recv() callers waiting for a plaintext to arrive. FIFO. */
    readonly #recvWaiters = new Array<{
        resolve: (value: Uint8Array) => void;
        reject: (reason: Error) => void;
    }>();

    /** Resolves once the DtlsClient reports `established`. */
    #onConnect:
        | {
              resolve: () => void;
              reject: (reason: Error) => void;
          }
        | undefined;

    constructor(opts: DtlsConnectOpts, hooks: NobleDtlsSocketHooks = {}) {
        this.#opts = opts;
        this.#hooks = hooks;
        this.#udpType = inferUdpType(opts.address, opts.type);
    }

    /**
     * Bind the UDP socket, run the handshake to "established". Throws on
     * timeout, give-up, or any DTLS-level failure.
     */
    async connect(): Promise<void> {
        if (this.#connected) {
            throw new Error("NobleDtlsSocket.connect: already connected");
        }
        if (this.#closed) {
            throw new Error("NobleDtlsSocket.connect: closed");
        }

        const udp = this.#hooks.createUdpSocket
            ? this.#hooks.createUdpSocket(this.#udpType)
            : createSocket({ type: this.#udpType, reuseAddr: false });
        this.#udp = udp;
        udp.on("message", msg => this.#onDatagram(msg));
        udp.on("error", err => this.#fail(err instanceof Error ? err : new Error(String(err))));

        await new Promise<void>((resolve, reject) => {
            const onError = (err: Error) => reject(err);
            udp.once("error", onError);
            udp.bind(0, () => {
                udp.removeListener("error", onError);
                resolve();
            });
        });

        const clientCfg: DtlsClientConfig = {
            password: this.#opts.password,
            random: this.#opts.random ?? defaultRandom,
            ephemeralScalar: this.#opts.ephemeralScalar ?? defaultEphemeralScalar,
            initialRetransmitMs: this.#opts.initialRetransmitMs ?? DEFAULT_INITIAL_RETRANSMIT_MS,
            maxRetransmitMs: this.#opts.maxRetransmitMs ?? DEFAULT_MAX_RETRANSMIT_MS,
            mtu: this.#opts.mtu ?? DEFAULT_MTU,
        };
        const client = new DtlsClient(clientCfg);
        this.#client = client;

        const setTimeoutImpl = this.#hooks.setTimeoutImpl ?? ((cb, ms) => setTimeout(cb, ms));
        const clearTimeoutImpl =
            this.#hooks.clearTimeoutImpl ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));

        this.#retransmit = new DtlsRetransmitTimer({
            initialMs: clientCfg.initialRetransmitMs ?? DEFAULT_INITIAL_RETRANSMIT_MS,
            maxMs: clientCfg.maxRetransmitMs ?? DEFAULT_MAX_RETRANSMIT_MS,
            maxRetransmits: this.#opts.maxRetransmits ?? DEFAULT_MAX_RETRANSMITS,
            onRetransmit: () => this.#onRetransmit(),
            onGiveUp: () => this.#fail(new Error("NobleDtlsSocket: handshake gave up after max retransmits")),
            setTimeoutImpl: (cb, ms) => ({ _opaque: setTimeoutImpl(cb, ms) }),
            clearTimeoutImpl: handle => clearTimeoutImpl(handle._opaque),
        });

        const connectPromise = new Promise<void>((resolve, reject) => {
            this.#onConnect = { resolve, reject };
        });
        const connectTimeoutMs = this.#opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
        this.#connectDeadline = setTimeoutImpl(
            () => this.#fail(new Error(`NobleDtlsSocket: connect timed out after ${connectTimeoutMs}ms`)),
            connectTimeoutMs,
        );

        // Drive the first flight.
        try {
            const step = client.start();
            this.#sendRecords(step.records);
            this.#retransmit.armNewFlight();
        } catch (e) {
            this.#fail(e instanceof Error ? e : new Error(String(e)));
        }

        try {
            await connectPromise;
        } finally {
            if (this.#connectDeadline !== undefined) {
                clearTimeoutImpl(this.#connectDeadline);
                this.#connectDeadline = undefined;
            }
        }
    }

    async send(bytes: Uint8Array): Promise<void> {
        if (this.#closed) {
            throw new Error("NobleDtlsSocket.send: closed");
        }
        if (!this.#connected) {
            throw new Error("NobleDtlsSocket.send: not connected");
        }
        const cipherState = this.#cipherState;
        const udp = this.#udp;
        if (cipherState === undefined || udp === undefined) {
            throw new Error("NobleDtlsSocket.send: missing cipher state or transport");
        }
        const seq = cipherState.nextWriteSeq();
        const record = DtlsRecord.encode(
            {
                type: ContentType.APPLICATION_DATA,
                epoch: cipherState.writeEpoch,
                sequenceNumber: seq,
                fragment: bytes,
            },
            cipherState,
        );
        await this.#sendDatagram(udp, record);
    }

    async recv(): Promise<Uint8Array> {
        if (this.#closed) {
            throw new Error("NobleDtlsSocket.recv: closed");
        }
        if (this.#recvQueue.length > 0) {
            return this.#recvQueue.shift()!;
        }
        return new Promise<Uint8Array>((resolve, reject) => {
            this.#recvWaiters.push({ resolve, reject });
        });
    }

    async close(): Promise<void> {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        // Best-effort close_notify alert at epoch 1 if armed.
        const cipherState = this.#cipherState;
        const udp = this.#udp;
        if (this.#connected && cipherState !== undefined && udp !== undefined) {
            try {
                const seq = cipherState.nextWriteSeq();
                const alertRecord = DtlsRecord.encode(
                    {
                        type: ContentType.ALERT,
                        epoch: cipherState.writeEpoch,
                        sequenceNumber: seq,
                        fragment: Uint8Array.of(ALERT_LEVEL_WARNING, ALERT_DESC_CLOSE_NOTIFY),
                    },
                    cipherState,
                );
                await this.#sendDatagram(udp, alertRecord).catch(() => {});
            } catch {
                // best-effort — closing transport regardless
            }
        }
        if (this.#retransmit !== undefined) {
            this.#retransmit.cancel();
        }
        if (udp !== undefined) {
            await new Promise<void>(resolve => {
                udp.close(() => resolve());
            }).catch(() => {});
        }
        // Reject any waiters.
        const closeError = this.#lastError ?? new Error("NobleDtlsSocket: closed");
        while (this.#recvWaiters.length > 0) {
            const w = this.#recvWaiters.shift()!;
            w.reject(closeError);
        }
        if (this.#onConnect !== undefined && !this.#connected) {
            const onConnect = this.#onConnect;
            this.#onConnect = undefined;
            onConnect.reject(closeError);
        }
    }

    /** True once the handshake reaches "established". */
    isConnected(): boolean {
        return this.#connected;
    }

    // -----------------------------------------------------------------------
    // Internals

    #onDatagram(bytes: Uint8Array): void {
        if (this.#closed) {
            return;
        }
        // Node's `dgram` emits Buffer, which extends Uint8Array — narrow to a clean
        // Uint8Array view so the record codec sees no Buffer-specific allocator.
        const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        try {
            if (this.#connected) {
                this.#handleAppDatagram(view);
            } else {
                this.#handleHandshakeDatagram(view);
            }
        } catch (e) {
            this.#fail(e instanceof Error ? e : new Error(String(e)));
        }
    }

    #handleHandshakeDatagram(bytes: Uint8Array): void {
        const client = this.#client;
        const retransmit = this.#retransmit;
        if (client === undefined || retransmit === undefined) {
            throw new Error("NobleDtlsSocket: handshake datagram before client/timer initialised");
        }
        const step = client.onDatagram(bytes);
        // RFC 6347 §4.2.4: receiving the next flight implicitly acknowledges the previous one.
        retransmit.cancel();
        if (step.records.length > 0) {
            this.#sendRecords(step.records);
        }
        if (client.isEstablished()) {
            this.#cipherState = client.cipherState();
            this.#connected = true;
            const onConnect = this.#onConnect;
            this.#onConnect = undefined;
            if (onConnect !== undefined) {
                onConnect.resolve();
            }
        } else if (step.records.length > 0) {
            retransmit.armNewFlight();
        }
    }

    #handleAppDatagram(bytes: Uint8Array): void {
        const cipherState = this.#cipherState;
        if (cipherState === undefined) {
            throw new Error("NobleDtlsSocket: post-handshake datagram with no cipher state");
        }
        let p = 0;
        while (p < bytes.length) {
            if (bytes.length - p < DTLS_HEADER_LEN) {
                throw new Error("NobleDtlsSocket: short DTLS record header");
            }
            const length = (bytes[p + 11] << 8) | bytes[p + 12];
            const recordEnd = p + DTLS_HEADER_LEN + length;
            if (recordEnd > bytes.length) {
                throw new Error("NobleDtlsSocket: DTLS record length overruns datagram");
            }
            const slice = bytes.subarray(p, recordEnd);
            const { record } = DtlsRecord.decode(slice, cipherState);
            if (record.type === ContentType.APPLICATION_DATA) {
                this.#deliverPlaintext(record.fragment);
            } else if (record.type === ContentType.ALERT) {
                // close_notify (level=1, desc=0) ends the session; other alerts surface as errors.
                if (record.fragment.length >= 2 && record.fragment[1] === ALERT_DESC_CLOSE_NOTIFY) {
                    this.#fail(new Error("NobleDtlsSocket: peer sent close_notify"));
                    return;
                }
                this.#fail(
                    new Error(
                        `NobleDtlsSocket: peer alert level=${record.fragment[0] ?? -1} desc=${record.fragment[1] ?? -1}`,
                    ),
                );
                return;
            }
            // Other content types post-handshake (CCS, HANDSHAKE for renegotiation) are dropped — the
            // EC-JPAKE/Thread profile never renegotiates.
            p = recordEnd;
        }
    }

    #deliverPlaintext(plaintext: Uint8Array): void {
        if (this.#recvWaiters.length > 0) {
            const waiter = this.#recvWaiters.shift()!;
            waiter.resolve(plaintext);
        } else {
            this.#recvQueue.push(plaintext);
        }
    }

    #onRetransmit(): void {
        const client = this.#client;
        if (client === undefined || this.#connected || this.#closed) {
            return;
        }
        try {
            const step = client.onRetransmit();
            this.#sendRecords(step.records);
        } catch (e) {
            this.#fail(e instanceof Error ? e : new Error(String(e)));
        }
    }

    #sendRecords(records: Uint8Array[]): void {
        const udp = this.#udp;
        if (udp === undefined) {
            throw new Error("NobleDtlsSocket: send before bind");
        }
        if (records.length === 0) {
            return;
        }
        // Coalesce a flight into MTU-sized datagrams so peers that decrypt the encrypted
        // Finished record can rely on the preceding ChangeCipherSpec being in the same
        // datagram (mbedTLS does this; our test mirror server requires it).
        const mtu = this.#opts.mtu ?? DEFAULT_MTU;
        const datagrams = new Array<Uint8Array>();
        let acc = new Array<Uint8Array>();
        let accLen = 0;
        for (const record of records) {
            if (accLen > 0 && accLen + record.length > mtu) {
                datagrams.push(concatBuffers(acc));
                acc = [];
                accLen = 0;
            }
            acc.push(record);
            accLen += record.length;
        }
        if (acc.length > 0) {
            datagrams.push(concatBuffers(acc));
        }
        for (const dg of datagrams) {
            // Errors propagate via the socket's `error` event handler.
            void this.#sendDatagram(udp, dg).catch(e => this.#fail(e instanceof Error ? e : new Error(String(e))));
        }
    }

    async #sendDatagram(udp: Socket, bytes: Uint8Array): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            udp.send(bytes, this.#opts.port, this.#opts.address, err => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    #fail(error: Error): void {
        if (this.#closed) {
            return;
        }
        if (this.#lastError === undefined) {
            this.#lastError = error;
        }
        if (this.#retransmit !== undefined) {
            this.#retransmit.cancel();
        }
        const onConnect = this.#onConnect;
        this.#onConnect = undefined;
        if (onConnect !== undefined && !this.#connected) {
            onConnect.reject(error);
        }
        while (this.#recvWaiters.length > 0) {
            const w = this.#recvWaiters.shift()!;
            w.reject(error);
        }
        // Tear the transport down asynchronously; callers see the rejection above.
        void this.close().catch(() => {});
    }
}
