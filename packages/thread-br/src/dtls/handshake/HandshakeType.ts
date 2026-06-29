/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TLS 1.2 / DTLS 1.2 HandshakeType values used by the EC-JPAKE flight diagram
 * (RFC 5246 §7.4, RFC 6347 §4.2). Only the subset needed for
 * `TLS_ECJPAKE_WITH_AES_128_CCM_8` is declared; any other byte triggers a
 * decode error in {@link HandshakeMessage.decode}.
 *
 * `HELLO_REQUEST` is included for completeness — we do not send it (we are
 * always the client) but mbedTLS will silently ignore it from the server side
 * and we want a known constant if a peer ever sends one.
 */
export const HandshakeType = {
    HELLO_REQUEST: 0,
    CLIENT_HELLO: 1,
    SERVER_HELLO: 2,
    HELLO_VERIFY_REQUEST: 3,
    CERTIFICATE: 11,
    SERVER_KEY_EXCHANGE: 12,
    SERVER_HELLO_DONE: 14,
    CLIENT_KEY_EXCHANGE: 16,
    FINISHED: 20,
} as const;

export type HandshakeType = (typeof HandshakeType)[keyof typeof HandshakeType];

const VALID_TYPES = new Set<number>([0, 1, 2, 3, 11, 12, 14, 16, 20]);

export function isHandshakeType(value: number): value is HandshakeType {
    return VALID_TYPES.has(value);
}
