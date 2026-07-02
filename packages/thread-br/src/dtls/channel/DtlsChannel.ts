/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type Bytes, type ConnectedChannel, MatterError, type Transport } from "@matter/general";

/** DTLS peer/wire/protocol failure (handshake give-up, malformed record, peer alert, ...). */
export class DtlsError extends MatterError {}

/**
 * Public channel interface for an established DTLS 1.2 + EC-JPAKE session.
 *
 * Modeled on the matter.js {@link ConnectedChannel} contract (framed, fixed-peer,
 * send/close/onClose plus an inbound {@link AsyncIterable}), but deliberately does
 * NOT implement it: DTLS runs over UDP and delivers application data unreliably,
 * so it cannot honor `ConnectedChannel.isReliable: true`. The CoAP layer consumes
 * only this surface — it sends and receives application-data plaintexts, iterates
 * inbound records, and closes the session. Handshake, key derivation, record
 * framing, and transport binding are implementation details.
 *
 * Inbound plaintexts are delivered via async iteration with backpressure: the
 * producer hands each plaintext to a waiting consumer, buffering only a bounded
 * number of records when no consumer is pending. On close or fatal error the
 * iterator drains any buffered records, then either ends or throws the stored
 * {@link DtlsError} to the consumer.
 *
 * Single-consumer only: at most one iteration with one outstanding `next()` may
 * be active at a time. A second concurrent `next()` throws rather than silently
 * stranding the first.
 */
export interface DtlsChannel extends AsyncIterable<Bytes> {
    /** Encrypt and transmit `bytes` as one DTLS application-data record. */
    send(bytes: Bytes): Promise<void>;

    /** Send close_notify (best-effort), tear down transport, end inbound iteration. */
    close(): Promise<void>;

    /** Register a listener for channel close/disconnect. */
    onClose(listener: () => void): Transport.Listener;
}
