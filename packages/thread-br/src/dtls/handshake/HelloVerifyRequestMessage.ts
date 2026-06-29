/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DTLS 1.2 HelloVerifyRequest body parser (RFC 6347 §4.2.1):
 *
 * ```
 * struct {
 *   ProtocolVersion server_version;   // 2 bytes (server may use {254, 255} for legacy reasons)
 *   opaque cookie<0..2^8-1>;          // 1-byte length + body
 * } HelloVerifyRequest;
 * ```
 *
 * Per RFC 6347 §4.2.1 the client MUST echo `server_version` back in the next
 * ClientHello, but in practice every modern stack (mbedTLS, OpenThread) uses
 * the same DTLS 1.2 version byte pair the client already advertised, so we
 * accept any version bytes here without enforcement and let the next
 * ClientHello carry the spec-mandated DTLS 1.2 version regardless.
 */

const MAX_COOKIE_LEN = 0xff;

export const HelloVerifyRequestMessage = {
    parse(body: Uint8Array): { cookie: Uint8Array } {
        if (body.length < 2 + 1) {
            throw new Error(`HelloVerifyRequest body truncated: have ${body.length}, need >= 3`);
        }
        // server_version (2 bytes) is intentionally not validated — see jsdoc.
        const cookieLen = body[2];
        if (cookieLen > MAX_COOKIE_LEN) {
            throw new Error(`HelloVerifyRequest cookie length ${cookieLen} exceeds ${MAX_COOKIE_LEN}`);
        }
        const expectedLen = 2 + 1 + cookieLen;
        if (body.length !== expectedLen) {
            throw new Error(
                `HelloVerifyRequest body length ${body.length} disagrees with cookie length ${cookieLen} (expected ${expectedLen})`,
            );
        }
        // slice (copy) so the parsed cookie does not alias the inbound datagram buffer.
        return { cookie: body.slice(3, 3 + cookieLen) };
    },
} as const;
