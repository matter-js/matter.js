/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Public socket-layer interface for an established DTLS 1.2 + EC-JPAKE session.
 *
 * The CoAP layer (Phase 4) consumes only this surface: it sends and receives
 * application-data plaintexts and closes the session. Handshake, key derivation,
 * record framing, and transport binding are implementation details.
 *
 * `recv()` resolves with the next decrypted application-data payload. Callers
 * are matched FIFO with arriving plaintexts. `close()` is idempotent and safe
 * to call after a fatal error; pending `recv()` promises reject with a
 * "closed" error.
 */
export interface DtlsSocket {
    /** Encrypt and transmit `bytes` as one DTLS application-data record. */
    send(bytes: Uint8Array): Promise<void>;

    /** Resolve with the next decrypted application-data plaintext. */
    recv(): Promise<Uint8Array>;

    /** Send close_notify (best-effort), tear down transport, reject pending recv() callers. */
    close(): Promise<void>;
}
