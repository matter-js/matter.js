/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { HandshakeType, isHandshakeType } from "./HandshakeType.js";

/** Length of the DTLS 1.2 handshake message header (RFC 6347 §4.2.2). */
export const DTLS_HANDSHAKE_HEADER_LEN = 12;

/** Length of the TLS 1.2 handshake message header (RFC 5246 §7.4). */
export const TLS_HANDSHAKE_HEADER_LEN = 4;

/** Maximum value representable in a 24-bit unsigned big-endian field. */
export const UINT24_MAX = (1 << 24) - 1;

/** Maximum value representable in a 16-bit unsigned big-endian field. */
const UINT16_MAX = 0xffff;

/**
 * One full (unfragmented) DTLS 1.2 handshake message (RFC 6347 §4.2.2). For the
 * EC-JPAKE handshake we never produce or consume fragmented handshake messages
 * — every flight fits in the conservative 1280-byte UDP MTU when measured per
 * record, and mbedTLS does not fragment the messages we exchange — so the
 * `fragment_offset` is always 0 and `fragment_length` always equals `length`.
 *
 * For a fragmented message the body would be only `fragment_length` bytes long;
 * fragmented input is rejected by {@link HandshakeMessage.decode} until we need
 * it. (Sub-batch 5 will add a reassembler if real-world traces ever fragment.)
 */
export interface HandshakeMessage {
    msgType: HandshakeType;
    messageSeq: number;
    body: Uint8Array;
}

function writeUint16BE(buf: Uint8Array, offset: number, value: number): void {
    buf[offset] = (value >>> 8) & 0xff;
    buf[offset + 1] = value & 0xff;
}

function writeUint24BE(buf: Uint8Array, offset: number, value: number): void {
    buf[offset] = (value >>> 16) & 0xff;
    buf[offset + 1] = (value >>> 8) & 0xff;
    buf[offset + 2] = value & 0xff;
}

function readUint16BE(buf: Uint8Array, offset: number): number {
    return (buf[offset] << 8) | buf[offset + 1];
}

function readUint24BE(buf: Uint8Array, offset: number): number {
    return (buf[offset] << 16) | (buf[offset + 1] << 8) | buf[offset + 2];
}

/**
 * DTLS 1.2 handshake message envelope codec (RFC 6347 §4.2.2).
 *
 * `encode` produces the wire form: `type(1) || length(3) || message_seq(2) ||
 * fragment_offset(3) || fragment_length(3) || body`. We always emit the
 * unfragmented form (`fragment_offset=0`, `fragment_length=body.length`).
 *
 * `encodeForTranscript` emits the **full DTLS 1.2 form** — same 12-byte header
 * as `encode` — required by the running handshake-transcript hash. mbedTLS
 * (and OpenThread BRs built on it) feed the full DTLS handshake bytes
 * including `message_seq` / `fragment_offset` / `fragment_length` into the
 * Finished MAC; an earlier reading of RFC 6347 §4.2.6 incorrectly suggested
 * stripping them. The `fragment_offset`/`fragment_length` are normalised to
 * the unfragmented form (0 / body.length) regardless of how the message was
 * actually fragmented on the wire (RFC 6347 §4.2.6 second paragraph).
 *
 * `decode` parses one DTLS handshake message off the front of the buffer; it
 * requires the message to be unfragmented (`fragment_offset=0`,
 * `fragment_length=length`).
 */
export namespace HandshakeMessage {
    export function encode(message: HandshakeMessage): Uint8Array {
        const { msgType, messageSeq, body } = message;
        if (!isHandshakeType(msgType)) {
            throw new Error(`HandshakeMessage unknown msg_type: ${msgType}`);
        }
        if (messageSeq < 0 || messageSeq > UINT16_MAX) {
            throw new Error(`HandshakeMessage message_seq ${messageSeq} out of range`);
        }
        if (body.length > UINT24_MAX) {
            throw new Error(`HandshakeMessage body length ${body.length} exceeds 24-bit max`);
        }
        const out = new Uint8Array(DTLS_HANDSHAKE_HEADER_LEN + body.length);
        out[0] = msgType;
        writeUint24BE(out, 1, body.length);
        writeUint16BE(out, 4, messageSeq);
        writeUint24BE(out, 6, 0);
        writeUint24BE(out, 9, body.length);
        out.set(body, DTLS_HANDSHAKE_HEADER_LEN);
        return out;
    }

    export function encodeForTranscript(message: HandshakeMessage): Uint8Array {
        return encode(message);
    }

    export interface DecodeResult {
        message: HandshakeMessage;
        consumed: number;
    }

    export function decode(bytes: Uint8Array): DecodeResult {
        if (bytes.length < DTLS_HANDSHAKE_HEADER_LEN) {
            throw new Error(
                `HandshakeMessage header truncated: have ${bytes.length}, need ${DTLS_HANDSHAKE_HEADER_LEN}`,
            );
        }
        const msgType = bytes[0];
        if (!isHandshakeType(msgType)) {
            throw new Error(`HandshakeMessage unknown msg_type: ${msgType}`);
        }
        const length = readUint24BE(bytes, 1);
        const messageSeq = readUint16BE(bytes, 4);
        const fragmentOffset = readUint24BE(bytes, 6);
        const fragmentLength = readUint24BE(bytes, 9);
        if (fragmentOffset !== 0 || fragmentLength !== length) {
            throw new Error(
                `HandshakeMessage fragmented input not supported: offset=${fragmentOffset} fragLen=${fragmentLength} totalLen=${length}`,
            );
        }
        const total = DTLS_HANDSHAKE_HEADER_LEN + length;
        if (bytes.length < total) {
            throw new Error(
                `HandshakeMessage body truncated: header says ${length}, have ${bytes.length - DTLS_HANDSHAKE_HEADER_LEN}`,
            );
        }
        return {
            message: {
                msgType,
                messageSeq,
                body: bytes.slice(DTLS_HANDSHAKE_HEADER_LEN, total),
            },
            consumed: total,
        };
    }
}
