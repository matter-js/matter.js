/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DTLS 1.2 ClientHello body builder for `TLS_ECJPAKE_WITH_AES_128_CCM_8`
 * (RFC 6347 §4.2.1, RFC 5246 §7.4.1.2). The shape is fixed:
 *
 * ```
 * ProtocolVersion client_version    // 2 bytes = 0xfe 0xfd (DTLS 1.2)
 * Random random                     // 32 bytes (caller-supplied)
 * opaque session_id<0..32>          // length(1) || body — always empty for us
 * opaque cookie<0..2^8-1>           // length(1) || body (DTLS-only, RFC 6347 §4.2.2)
 * CipherSuite cipher_suites<2..>    // length(2) || N×2 bytes — exactly [0xC0, 0xFF]
 * opaque compression<1..>           // length(1) || N bytes — exactly [0x00]
 * Extension extensions<0..2^16-1>   // length(2) || extension entries
 * ```
 *
 * Each Extension is `uint16 extension_type || opaque extension_data<0..2^16-1>`.
 * Required extensions:
 * - `ecjpake_kkpp` (0x0100, draft-cragie-tls-ecjpake-01) — round-1 ECJPAKEKeyKPPairList payload
 * - `supported_groups` (0x000a, RFC 8422 §5.1.1) — peer requires this even though the cipher
 *   suite hardcodes P-256, otherwise mbedtls rejects with "no common elliptic curve"
 * - `ec_point_formats` (0x000b, RFC 8422 §5.1.2) — uncompressed-only; mbedtls is lenient if
 *   omitted but real BRs may not be
 */

/** TLS extension type for `ecjpake_kkpp` (draft-cragie-tls-ecjpake-01 §3). */
export const EXTENSION_TYPE_ECJPAKE_KKPP = 0x0100;

/** TLS extension type for `supported_groups` (RFC 8422 §5.1.1, formerly `elliptic_curves`). */
export const EXTENSION_TYPE_SUPPORTED_GROUPS = 0x000a;

/** TLS extension type for `ec_point_formats` (RFC 8422 §5.1.2). */
export const EXTENSION_TYPE_EC_POINT_FORMATS = 0x000b;

/** Named-curve identifier for `secp256r1` (P-256, RFC 8422 §5.1.1). */
export const NAMED_CURVE_SECP256R1 = 0x0017;

/** TLS cipher-suite identifier for `TLS_ECJPAKE_WITH_AES_128_CCM_8` (mbedTLS, experimental). */
export const CIPHER_SUITE_ECJPAKE_WITH_AES_128_CCM_8 = 0xc0ff;

const DTLS_1_2_MAJOR = 0xfe;
const DTLS_1_2_MINOR = 0xfd;
const RANDOM_LEN = 32;
const COMPRESSION_NULL = 0x00;
const MAX_COOKIE_LEN = 0xff;

export interface ClientHelloFields {
    /** 32 random bytes that will become `ClientHello.random`. */
    random: Uint8Array;
    /**
     * DTLS cookie returned by `HelloVerifyRequest`, or empty on the first ClientHello
     * (RFC 6347 §4.2.1).
     */
    cookie: Uint8Array;
    /** `ecjpake_kkpp` extension payload — the round-1 ECJPAKEKeyKPPairList bytes. */
    ecjpakeKkpp: Uint8Array;
}

function writeUint16BE(buf: Uint8Array, offset: number, value: number): void {
    buf[offset] = (value >>> 8) & 0xff;
    buf[offset + 1] = value & 0xff;
}

export const ClientHelloMessage = {
    /**
     * Serialise a ClientHello body. Caller wraps the result in a
     * {@link HandshakeMessage} and a `DtlsRecord` of `ContentType.HANDSHAKE`.
     */
    build(fields: ClientHelloFields): Uint8Array {
        const { random, cookie, ecjpakeKkpp } = fields;
        if (random.length !== RANDOM_LEN) {
            throw new Error(`ClientHello random must be ${RANDOM_LEN} bytes, got ${random.length}`);
        }
        if (cookie.length > MAX_COOKIE_LEN) {
            throw new Error(`ClientHello cookie must be <= ${MAX_COOKIE_LEN} bytes, got ${cookie.length}`);
        }
        const ecjpakeExtLen = 2 + 2 + ecjpakeKkpp.length;
        const supportedGroupsExtLen = 2 + 2 + 2 + 2; // header(4) + list_len(2) + secp256r1(2)
        const ecPointFormatsExtLen = 2 + 2 + 1 + 1; // header(4) + list_len(1) + uncompressed(1)
        const extEntryLen = ecjpakeExtLen + supportedGroupsExtLen + ecPointFormatsExtLen;
        const extensionsBlockLen = 2 + extEntryLen;

        const totalLen =
            2 + // version
            RANDOM_LEN +
            1 + // session_id length (always 0)
            1 +
            cookie.length + // cookie length + body
            2 +
            2 + // cipher_suites length(2) + 2 bytes for the suite
            1 +
            1 + // compression length(1) + 1 byte (null)
            extensionsBlockLen;

        const out = new Uint8Array(totalLen);
        let p = 0;
        out[p++] = DTLS_1_2_MAJOR;
        out[p++] = DTLS_1_2_MINOR;
        out.set(random, p);
        p += RANDOM_LEN;
        out[p++] = 0; // session_id length, no body
        out[p++] = cookie.length;
        out.set(cookie, p);
        p += cookie.length;
        // cipher_suites: length=2, body=[0xC0, 0xFF]
        writeUint16BE(out, p, 2);
        p += 2;
        out[p++] = (CIPHER_SUITE_ECJPAKE_WITH_AES_128_CCM_8 >>> 8) & 0xff;
        out[p++] = CIPHER_SUITE_ECJPAKE_WITH_AES_128_CCM_8 & 0xff;
        // compression_methods: length=1, body=[0x00]
        out[p++] = 1;
        out[p++] = COMPRESSION_NULL;
        // extensions block
        writeUint16BE(out, p, extEntryLen);
        p += 2;
        // ecjpake_kkpp
        writeUint16BE(out, p, EXTENSION_TYPE_ECJPAKE_KKPP);
        p += 2;
        writeUint16BE(out, p, ecjpakeKkpp.length);
        p += 2;
        out.set(ecjpakeKkpp, p);
        p += ecjpakeKkpp.length;
        // supported_groups: list_len=2, [secp256r1]
        writeUint16BE(out, p, EXTENSION_TYPE_SUPPORTED_GROUPS);
        p += 2;
        writeUint16BE(out, p, 4); // ext data: list_len(2) + 1 curve(2)
        p += 2;
        writeUint16BE(out, p, 2); // list_len = 2 bytes (one curve)
        p += 2;
        writeUint16BE(out, p, NAMED_CURVE_SECP256R1);
        p += 2;
        // ec_point_formats: list_len=1, [uncompressed=0x00]
        writeUint16BE(out, p, EXTENSION_TYPE_EC_POINT_FORMATS);
        p += 2;
        writeUint16BE(out, p, 2); // ext data: list_len(1) + 1 format(1)
        p += 2;
        out[p++] = 1; // list_len = 1 byte (one format)
        out[p++] = 0x00; // uncompressed
        if (p !== totalLen) {
            throw new Error(`ClientHello internal length mismatch: wrote ${p}, expected ${totalLen}`);
        }
        return out;
    },
} as const;
