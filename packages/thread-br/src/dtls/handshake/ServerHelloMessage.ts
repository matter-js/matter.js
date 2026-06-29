/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { CIPHER_SUITE_ECJPAKE_WITH_AES_128_CCM_8, EXTENSION_TYPE_ECJPAKE_KKPP } from "./ClientHelloMessage.js";

/**
 * DTLS 1.2 ServerHello body parser (RFC 5246 §7.4.1.3, layered into RFC 6347):
 *
 * ```
 * ProtocolVersion server_version    // 2 bytes — must be DTLS 1.2 (0xfe 0xfd)
 * Random random                     // 32 bytes
 * opaque session_id<0..32>          // length(1) || body
 * CipherSuite cipher_suite          // 2 bytes — must be TLS_ECJPAKE_WITH_AES_128_CCM_8 (0xC0FF)
 * uint8 compression_method          // 1 byte — must be 0x00 (null)
 * Extension extensions<0..2^16-1>   // length(2) || entries (optional, present when bytes remain)
 * ```
 *
 * Each Extension is `uint16 extension_type || opaque extension_data<0..2^16-1>`.
 * The parser validates that the cipher suite, compression method and DTLS
 * version match the ones we sent — anything else is a hard error since the
 * server has agreed to a configuration we cannot speak — and extracts:
 *
 * - `serverRandom`: the 32-byte server random fed into the TLS PRF.
 * - `ecjpakeKkpp`: the body of the server's `ecjpake_kkpp` extension (the
 *    round-1 ECJPAKEKeyKPPairList from the server's perspective).
 *
 * Unknown extensions are tolerated and skipped; the spec allows servers to
 * send extensions the client did not request as long as the matching ones
 * are correct (RFC 5246 §7.4.1.4). We refuse only on missing `ecjpake_kkpp`.
 */

const DTLS_1_2_MAJOR = 0xfe;
const DTLS_1_2_MINOR = 0xfd;
const RANDOM_LEN = 32;
const COMPRESSION_NULL = 0x00;

function readUint16BE(buf: Uint8Array, offset: number): number {
    return (buf[offset] << 8) | buf[offset + 1];
}

export interface ParsedServerHello {
    /** Server's 32-byte random — feeds the TLS PRF. */
    serverRandom: Uint8Array;
    /** Server's `ecjpake_kkpp` extension data (round-1 ECJPAKEKeyKPPairList). */
    ecjpakeKkpp: Uint8Array;
}

export const ServerHelloMessage = {
    parse(body: Uint8Array): ParsedServerHello {
        if (body.length < 2 + RANDOM_LEN + 1 + 2 + 1) {
            throw new Error(`ServerHello body truncated: have ${body.length}`);
        }
        let p = 0;
        const major = body[p++];
        const minor = body[p++];
        if (major !== DTLS_1_2_MAJOR || minor !== DTLS_1_2_MINOR) {
            throw new Error(`ServerHello version ${major.toString(16)}.${minor.toString(16)} is not DTLS 1.2`);
        }
        // slice (copy) so the parsed random does not alias the inbound datagram buffer.
        const serverRandom = body.slice(p, p + RANDOM_LEN);
        p += RANDOM_LEN;
        const sessionIdLen = body[p++];
        if (p + sessionIdLen > body.length) {
            throw new Error(`ServerHello session_id length ${sessionIdLen} overruns body`);
        }
        // We don't preserve the session_id — we never resume sessions in this stack.
        p += sessionIdLen;
        if (p + 2 + 1 > body.length) {
            throw new Error(`ServerHello truncated before cipher_suite/compression_method`);
        }
        const suite = readUint16BE(body, p);
        p += 2;
        if (suite !== CIPHER_SUITE_ECJPAKE_WITH_AES_128_CCM_8) {
            throw new Error(
                `ServerHello selected unsupported cipher suite 0x${suite.toString(16).padStart(4, "0")}; require TLS_ECJPAKE_WITH_AES_128_CCM_8 (0xc0ff)`,
            );
        }
        const compression = body[p++];
        if (compression !== COMPRESSION_NULL) {
            throw new Error(`ServerHello selected unsupported compression method 0x${compression.toString(16)}`);
        }

        let ecjpakeKkpp: Uint8Array | undefined;
        if (p < body.length) {
            if (p + 2 > body.length) {
                throw new Error("ServerHello extensions block length truncated");
            }
            const extsLen = readUint16BE(body, p);
            p += 2;
            const extsEnd = p + extsLen;
            if (extsEnd > body.length) {
                throw new Error(`ServerHello extensions length ${extsLen} overruns body`);
            }
            while (p < extsEnd) {
                if (p + 4 > extsEnd) {
                    throw new Error("ServerHello extension entry truncated");
                }
                const extType = readUint16BE(body, p);
                p += 2;
                const extDataLen = readUint16BE(body, p);
                p += 2;
                if (p + extDataLen > extsEnd) {
                    throw new Error(`ServerHello extension type 0x${extType.toString(16)} data overruns`);
                }
                if (extType === EXTENSION_TYPE_ECJPAKE_KKPP) {
                    if (ecjpakeKkpp !== undefined) {
                        throw new Error("ServerHello contains multiple ecjpake_kkpp extensions");
                    }
                    ecjpakeKkpp = body.slice(p, p + extDataLen);
                }
                p += extDataLen;
            }
            if (p !== extsEnd) {
                throw new Error(`ServerHello extensions block ended at ${p}, expected ${extsEnd}`);
            }
        }
        if (p !== body.length) {
            throw new Error(`ServerHello has ${body.length - p} trailing bytes after extensions block`);
        }
        if (ecjpakeKkpp === undefined) {
            throw new Error("ServerHello missing required ecjpake_kkpp extension (type 0x0100)");
        }
        return { serverRandom, ecjpakeKkpp };
    },
} as const;
