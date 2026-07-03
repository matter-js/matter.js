/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    Bytes,
    Crypto,
    type Entropy,
    ImplementationError,
    InternalError,
    Logger,
    Millis,
    Network,
    Time,
    TimeoutError,
    type Timer,
    type Transport,
    type UdpSocket,
} from "@matter/general";
import { p256 } from "@noble/curves/nist.js";
import { DtlsClient, type DtlsClientConfig } from "../handshake/DtlsClient.js";
import { ContentType } from "../record/ContentType.js";
import { type DtlsCipherState } from "../record/DtlsCipherState.js";
import { DTLS_HEADER_LEN, DtlsRecord, DtlsReplayError } from "../record/DtlsRecord.js";
import { type DtlsChannel, DtlsError } from "./DtlsChannel.js";
import type { DtlsConnectOpts } from "./DtlsConnectOpts.js";
import { DtlsRetransmitTimer } from "./DtlsRetransmitTimer.js";

const logger = Logger.get("NobleDtlsChannel");

const DEFAULT_INITIAL_RETRANSMIT_MS = 1000;
const DEFAULT_MAX_RETRANSMIT_MS = 60_000;
const DEFAULT_MAX_RETRANSMITS = 5;
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const DEFAULT_MTU = 1280;

/**
 * Cap on inbound plaintexts buffered while no consumer is iterating. DTLS app
 * data over UDP is unreliable, so overflowing this bound closes the channel
 * rather than growing without limit — the CoAP consumer processes one record per
 * loop iteration, so a healthy session never approaches it.
 */
const MAX_INBOUND_QUEUE = 64;

const N = p256.Point.Fn.ORDER;

const ALERT_LEVEL_WARNING = 1;
const ALERT_DESC_CLOSE_NOTIFY = 0;

function inferUdpType(address: string, hint?: "udp4" | "udp6"): "udp4" | "udp6" {
    if (hint !== undefined) {
        return hint;
    }
    return address.includes(":") ? "udp6" : "udp4";
}

function defaultRandom(entropy: Entropy): Uint8Array {
    return Bytes.of(entropy.randomBytes(32));
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

function defaultEphemeralScalar(entropy: Entropy): bigint {
    // Sample 32 bytes and reduce mod (n-1), then add 1 to land in [1, n-1].
    // 256 bits with mod-(n-1) bias is < 2^-128 — acceptable for transient ephemerals.
    let v = 0n;
    const buf = Bytes.of(entropy.randomBytes(32));
    for (const byte of buf) {
        v = (v << 8n) | BigInt(byte);
    }
    return (v % (N - 1n)) + 1n;
}

/**
 * UDP-bound DTLS 1.2 + EC-JPAKE client. Drives a {@link DtlsClient} state machine
 * over a matter.js {@link UdpSocket}, applies RFC 6347 §4.2.4 retransmit on the
 * handshake flights, then exposes a plaintext {@link DtlsChannel} surface for
 * application data (CoAP in Phase 4).
 *
 * Lifecycle: caller constructs with {@link DtlsConnectOpts}, awaits
 * {@link connect()} (which throws on handshake failure / timeout / give-up),
 * then uses {@link send} and inbound async iteration until {@link close}.
 * `close()` is idempotent and will best-effort send a close_notify alert.
 */
export class NobleDtlsChannel implements DtlsChannel {
    readonly #opts: DtlsConnectOpts;
    readonly #udpType: "udp4" | "udp6";

    #udp: UdpSocket | undefined;
    #client: DtlsClient | undefined;
    #retransmit: DtlsRetransmitTimer | undefined;

    /** Established cipher state (snapshot of the DtlsClient's after handshake). */
    #cipherState: DtlsCipherState | undefined;
    #connected = false;
    #closed = false;
    #failure: Error | undefined;
    #failureDelivered = false;

    /** Connect-deadline timer handle. */
    #connectDeadline: Timer | undefined;

    /** Decrypted application-data plaintexts buffered until a consumer takes them. Bounded by {@link MAX_INBOUND_QUEUE}. */
    readonly #inboundQueue = new Array<Bytes>();
    /** A single pending consumer waiting on the async iterator. */
    #inboundWaiter:
        | {
              resolve: (result: IteratorResult<Bytes>) => void;
              reject: (reason: Error) => void;
          }
        | undefined;

    readonly #closeListeners = new Set<() => void>();

    /** Resolves once the DtlsClient reports `established`. */
    #onConnect:
        | {
              resolve: () => void;
              reject: (reason: Error) => void;
          }
        | undefined;

    constructor(opts: DtlsConnectOpts) {
        this.#opts = opts;
        this.#udpType = inferUdpType(opts.address, opts.type);
    }

    /**
     * Bind the UDP socket, run the handshake to "established". Throws on
     * timeout, give-up, or any DTLS-level failure.
     */
    async connect(): Promise<void> {
        if (this.#connected) {
            throw new ImplementationError("NobleDtlsChannel.connect: already connected");
        }
        if (this.#closed) {
            throw new ImplementationError("NobleDtlsChannel.connect: closed");
        }

        const environment = this.#opts.environment;
        const network = environment.get(Network);
        const entropy = environment.get(Crypto);
        const udp = await network.createUdpSocket({ type: this.#udpType, listeningPort: 0 });
        if (this.#closed) {
            await udp.close();
            throw new ImplementationError("NobleDtlsChannel.connect: closed");
        }
        this.#udp = udp;
        udp.onData((_netInterface, _peerAddress, _peerPort, data) => this.#onDatagram(Bytes.of(data)));

        const clientCfg: DtlsClientConfig = {
            password: this.#opts.password,
            random: this.#opts.random ?? (() => defaultRandom(entropy)),
            ephemeralScalar: this.#opts.ephemeralScalar ?? (() => defaultEphemeralScalar(entropy)),
            initialRetransmitMs: this.#opts.initialRetransmitMs ?? DEFAULT_INITIAL_RETRANSMIT_MS,
            maxRetransmitMs: this.#opts.maxRetransmitMs ?? DEFAULT_MAX_RETRANSMIT_MS,
            mtu: this.#opts.mtu ?? DEFAULT_MTU,
        };
        const client = new DtlsClient(clientCfg);
        this.#client = client;

        this.#retransmit = new DtlsRetransmitTimer({
            initialMs: clientCfg.initialRetransmitMs ?? DEFAULT_INITIAL_RETRANSMIT_MS,
            maxMs: clientCfg.maxRetransmitMs ?? DEFAULT_MAX_RETRANSMIT_MS,
            maxRetransmits: this.#opts.maxRetransmits ?? DEFAULT_MAX_RETRANSMITS,
            onRetransmit: () => this.#onRetransmit(),
            onGiveUp: () => this.#fail(new DtlsError("NobleDtlsChannel: handshake gave up after max retransmits")),
        });

        const connectPromise = new Promise<void>((resolve, reject) => {
            this.#onConnect = { resolve, reject };
        });
        const connectTimeoutMs = this.#opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
        this.#connectDeadline = Time.getTimer("dtls-connect-deadline", Millis(connectTimeoutMs), () =>
            this.#fail(new TimeoutError(`NobleDtlsChannel: connect timed out after ${connectTimeoutMs}ms`)),
        ).start();

        // Drive the first flight.
        try {
            const step = client.start();
            this.#sendRecords(step.records);
            this.#retransmit.armNewFlight();
        } catch (e) {
            this.#fail(e instanceof Error ? e : new InternalError(String(e)));
        }

        try {
            await connectPromise;
        } finally {
            this.#connectDeadline?.stop();
            this.#connectDeadline = undefined;
        }
    }

    async send(bytes: Bytes): Promise<void> {
        if (this.#closed) {
            throw new ImplementationError("NobleDtlsChannel.send: closed");
        }
        if (!this.#connected) {
            throw new ImplementationError("NobleDtlsChannel.send: not connected");
        }
        const cipherState = this.#cipherState;
        const udp = this.#udp;
        if (cipherState === undefined || udp === undefined) {
            throw new InternalError("NobleDtlsChannel.send: missing cipher state or transport");
        }
        const seq = cipherState.nextWriteSeq();
        const record = DtlsRecord.encode(
            {
                type: ContentType.APPLICATION_DATA,
                epoch: cipherState.writeEpoch,
                sequenceNumber: seq,
                fragment: Bytes.of(bytes),
            },
            cipherState,
        );
        await this.#sendDatagram(udp, record);
    }

    [Symbol.asyncIterator](): AsyncIterator<Bytes> {
        return {
            next: (): Promise<IteratorResult<Bytes>> => {
                if (this.#inboundQueue.length > 0) {
                    return Promise.resolve({ value: this.#inboundQueue.shift()!, done: false });
                }
                if (this.#failure !== undefined && !this.#failureDelivered) {
                    this.#failureDelivered = true;
                    return Promise.reject(this.#failure);
                }
                if (this.#closed) {
                    return Promise.resolve({ value: undefined, done: true });
                }
                if (this.#inboundWaiter !== undefined) {
                    return Promise.reject(
                        new ImplementationError("NobleDtlsChannel: concurrent iteration not supported"),
                    );
                }
                return new Promise<IteratorResult<Bytes>>((resolve, reject) => {
                    this.#inboundWaiter = { resolve, reject };
                });
            },
            return: async (): Promise<IteratorResult<Bytes>> => {
                await this.close();
                return { value: undefined, done: true };
            },
        };
    }

    onClose(listener: () => void): Transport.Listener {
        this.#closeListeners.add(listener);
        return {
            close: async () => {
                this.#closeListeners.delete(listener);
            },
        };
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
            await udp.close().catch(() => {});
        }
        // Release a waiting consumer: surface the fatal error if any is still undelivered, else end iteration.
        const waiter = this.#inboundWaiter;
        this.#inboundWaiter = undefined;
        if (waiter !== undefined) {
            if (this.#failure !== undefined && !this.#failureDelivered) {
                this.#failureDelivered = true;
                waiter.reject(this.#failure);
            } else {
                waiter.resolve({ value: undefined, done: true });
            }
        }
        for (const listener of this.#closeListeners) {
            listener();
        }
        if (this.#onConnect !== undefined && !this.#connected) {
            const onConnect = this.#onConnect;
            this.#onConnect = undefined;
            onConnect.reject(this.#failure ?? new DtlsError("NobleDtlsChannel: closed"));
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
        try {
            if (this.#connected) {
                this.#handleAppDatagram(bytes);
            } else {
                this.#handleHandshakeDatagram(bytes);
            }
        } catch (e) {
            this.#fail(e instanceof Error ? e : new InternalError(String(e)));
        }
    }

    #handleHandshakeDatagram(bytes: Uint8Array): void {
        const client = this.#client;
        const retransmit = this.#retransmit;
        if (client === undefined || retransmit === undefined) {
            throw new InternalError("NobleDtlsChannel: handshake datagram before client/timer initialised");
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
            throw new InternalError("NobleDtlsChannel: post-handshake datagram with no cipher state");
        }
        let p = 0;
        while (p < bytes.length) {
            if (bytes.length - p < DTLS_HEADER_LEN) {
                throw new DtlsError("NobleDtlsChannel: short DTLS record header");
            }
            const length = (bytes[p + 11] << 8) | bytes[p + 12];
            const recordEnd = p + DTLS_HEADER_LEN + length;
            if (recordEnd > bytes.length) {
                throw new DtlsError("NobleDtlsChannel: DTLS record length overruns datagram");
            }
            const slice = bytes.subarray(p, recordEnd);
            let record: DtlsRecord;
            try {
                ({ record } = DtlsRecord.decode(slice, cipherState));
            } catch (e) {
                // RFC 6347 §4.1.2.6: a replayed/old-sequence record is benign (normal UDP
                // duplication) — drop just this record and keep processing the datagram.
                // Every other decode failure (AEAD, malformed) stays fatal.
                if (e instanceof DtlsReplayError) {
                    logger.debug(`Dropping replayed DTLS record epoch=${e.epoch} seq=${e.sequenceNumber}`);
                    p = recordEnd;
                    continue;
                }
                throw e;
            }
            if (record.type === ContentType.APPLICATION_DATA) {
                this.#deliverPlaintext(record.fragment);
            } else if (record.type === ContentType.ALERT) {
                // close_notify (level=1, desc=0) ends the session; other alerts surface as errors.
                if (record.fragment.length >= 2 && record.fragment[1] === ALERT_DESC_CLOSE_NOTIFY) {
                    this.#fail(new DtlsError("NobleDtlsChannel: peer sent close_notify"));
                    return;
                }
                this.#fail(
                    new DtlsError(
                        `NobleDtlsChannel: peer alert level=${record.fragment[0] ?? -1} desc=${record.fragment[1] ?? -1}`,
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
        const waiter = this.#inboundWaiter;
        if (waiter !== undefined) {
            this.#inboundWaiter = undefined;
            waiter.resolve({ value: plaintext, done: false });
            return;
        }
        this.#inboundQueue.push(plaintext);
        if (this.#inboundQueue.length > MAX_INBOUND_QUEUE) {
            this.#fail(new DtlsError("NobleDtlsChannel: inbound buffer overflow — consumer too slow"));
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
            this.#fail(e instanceof Error ? e : new InternalError(String(e)));
        }
    }

    #sendRecords(records: Uint8Array[]): void {
        const udp = this.#udp;
        if (udp === undefined) {
            throw new InternalError("NobleDtlsChannel: send before bind");
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
            void this.#sendDatagram(udp, dg).catch(e =>
                this.#fail(e instanceof Error ? e : new InternalError(String(e))),
            );
        }
    }

    async #sendDatagram(udp: UdpSocket, bytes: Uint8Array): Promise<void> {
        await udp.send(this.#opts.address, this.#opts.port, bytes);
    }

    #fail(error: Error): void {
        if (this.#closed) {
            return;
        }
        if (this.#failure === undefined) {
            this.#failure = error;
        }
        if (this.#retransmit !== undefined) {
            this.#retransmit.cancel();
        }
        const onConnect = this.#onConnect;
        this.#onConnect = undefined;
        if (onConnect !== undefined && !this.#connected) {
            onConnect.reject(error);
        }
        const waiter = this.#inboundWaiter;
        this.#inboundWaiter = undefined;
        if (waiter !== undefined) {
            this.#failureDelivered = true;
            waiter.reject(error);
        }
        // Tear the transport down asynchronously; callers see the rejection above.
        void this.close().catch(() => {});
    }
}
