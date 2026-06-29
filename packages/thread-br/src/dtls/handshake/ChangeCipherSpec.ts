/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ChangeCipherSpec is *not* a handshake message — it sits at the record layer
 * under its own ContentType (20) and consists of a single byte 0x01
 * (RFC 5246 §7.1). The state machine wraps {@link CHANGE_CIPHER_SPEC_BODY}
 * in a `DtlsRecord` with `type = ContentType.CHANGE_CIPHER_SPEC`, NOT in a
 * handshake envelope, and the bytes do not feed the handshake-transcript
 * hash (RFC 5246 §7.4.9).
 *
 * Kept as a shared 1-byte buffer so the state machine can pass it directly
 * to `DtlsRecord.encode` without per-call allocation. (Typed arrays cannot
 * be `Object.freeze`d while their element storage is live, so the readonly
 * guarantee is type-only.)
 */
export const CHANGE_CIPHER_SPEC_BODY: Readonly<Uint8Array> = new Uint8Array([0x01]);

export const ChangeCipherSpec = {
    parse(body: Uint8Array): void {
        if (body.length !== 1 || body[0] !== 0x01) {
            throw new Error(
                `ChangeCipherSpec must be a single 0x01 byte, got len=${body.length} first=${body[0] ?? "undefined"}`,
            );
        }
    },
} as const;
