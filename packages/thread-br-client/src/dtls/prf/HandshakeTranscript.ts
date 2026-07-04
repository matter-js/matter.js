/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, Crypto, InternalError } from "@matter/general";

const SHA256_LEN = 32;

/**
 * Running SHA-256 over the DTLS 1.2 handshake transcript that feeds the
 * Finished MAC (RFC 5246 §7.4.9). The transcript covers every handshake
 * message from the initial ClientHello up to (and EXCLUDING) the Finished
 * being computed or verified.
 *
 * Callers feed the **full DTLS 1.2 handshake message bytes** (12-byte header
 * including `message_seq` / `fragment_offset` / `fragment_length`, then body).
 * mbedTLS — and OpenThread BRs built on it — hash the full DTLS form;
 * stripping the DTLS-only fields makes the Finished MAC mismatch.
 * `fragment_offset`/`fragment_length` are normalised to the unfragmented form
 * regardless of how the message was actually fragmented on the wire (RFC 6347
 * §4.2.6).
 *
 * Internal to `dtls/`; not re-exported from the package public API surface.
 */
export class HandshakeTranscript {
    readonly #crypto: Crypto;
    readonly #chunks = new Array<Uint8Array>();

    constructor(crypto: Crypto) {
        this.#crypto = crypto;
    }

    /**
     * Append a handshake message in DTLS 1.2 form
     * (`type(1) || length(3) || message_seq(2) || fragment_offset(3) || fragment_length(3) || body`).
     */
    appendHandshakeMessage(messageBytes: Uint8Array): void {
        if (messageBytes.length > 0) {
            // Copy: the deferred digest() must not observe caller mutations after append.
            this.#chunks.push(new Uint8Array(messageBytes));
        }
    }

    /**
     * SHA-256 over the messages appended so far. Non-mutating: the buffer keeps
     * growing, so the same transcript yields Finished for both peers and keeps
     * absorbing later messages.
     */
    async digest(): Promise<Uint8Array> {
        const out = Bytes.of(await this.#crypto.computeHash(this.#chunks));
        if (out.length !== SHA256_LEN) {
            throw new InternalError(`HandshakeTranscript digest length ${out.length} != ${SHA256_LEN}`);
        }
        return out;
    }
}
