/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { AesCcm8 } from "./AesCcm8.js";
import { ContentType, isContentType } from "./ContentType.js";

/**
 * DTLS 1.2 protocol version on the wire is `{ major: 0xfe, minor: 0xfd }`,
 * the 1's-complement convention TLS uses (RFC 6347 §4.1).
 */
export const DTLS_1_2_VERSION = Object.freeze({ major: 0xfe, minor: 0xfd });

/** Maximum length of the DTLSCiphertext.fragment field (RFC 6347 §4.1). */
export const DTLS_MAX_FRAGMENT_LEN = 1 << 14;

/** 8-byte explicit AEAD nonce + 8-byte CCM-8 tag overhead per RFC 6655 §3. */
export const DTLS_AEAD_OVERHEAD = 16;

/** Length of the DTLS record header (RFC 6347 §4.1). */
export const DTLS_HEADER_LEN = 13;

/**
 * Minimal cipher-state surface the record codec needs. The full {@link DtlsCipherState}
 * class implements this and adds key-block bookkeeping; this interface lets the codec
 * accept either the class or a stand-in test double without forcing a circular import.
 *
 * `acceptIncoming`, when present, is invoked after a successful AEAD decrypt to apply
 * the RFC 6347 §4.1.2.6 anti-replay window. Returning `false` causes the codec to throw
 * a {@link DtlsReplayError}.
 */
export interface DtlsRecordCipherState {
    /** AES key + 4-byte salt to use for outbound (encrypt) records. */
    encryptParams(): { key: Uint8Array; salt: Uint8Array };
    /** AES key + 4-byte salt to use for inbound (decrypt) records. */
    decryptParams(): { key: Uint8Array; salt: Uint8Array };
    /** Build the 12-byte CCM nonce: salt(4) || epoch(2) || seq(6). */
    nonceFor(salt: Uint8Array, epoch: number, seqNum: bigint): Uint8Array;
    /** Build the 13-byte DTLS AAD: epoch||seq(8) || type(1) || version(2) || plaintextLen(2). */
    aadFor(type: ContentType, epoch: number, seqNum: bigint, plaintextLen: number): Uint8Array;
    /** Optional read-side replay-window check; absent on test doubles or pre-handshake states. */
    acceptIncoming?(epoch: number, seqNum: bigint): boolean;
}

/**
 * Thrown by {@link DtlsRecord.decode} when a successfully-decrypted record is rejected
 * by the read-side anti-replay window. Distinguishable from AEAD failures so the caller
 * can log/drop without treating the record as a fatal error.
 */
export class DtlsReplayError extends Error {
    readonly epoch: number;
    readonly sequenceNumber: bigint;

    constructor(epoch: number, sequenceNumber: bigint) {
        super(`DTLS replay or wrong-epoch record at epoch=${epoch} seq=${sequenceNumber}`);
        this.name = "DtlsReplayError";
        this.epoch = epoch;
        this.sequenceNumber = sequenceNumber;
    }
}

/**
 * Decoded DTLS 1.2 record (RFC 6347 §4.1).
 * `fragment` is always the *plaintext* payload — for epoch=0 records it is the wire bytes
 * verbatim, for epoch>0 records it is the AEAD-decrypted body.
 */
export interface DtlsRecord {
    type: ContentType;
    epoch: number;
    sequenceNumber: bigint;
    fragment: Uint8Array;
}

const MAX_EPOCH = 0xffff;
const MAX_SEQ = (1n << 48n) - 1n;

function writeUint16BE(buf: Uint8Array, offset: number, value: number): void {
    buf[offset] = (value >>> 8) & 0xff;
    buf[offset + 1] = value & 0xff;
}

function readUint16BE(buf: Uint8Array, offset: number): number {
    return (buf[offset] << 8) | buf[offset + 1];
}

function writeUint48BE(buf: Uint8Array, offset: number, value: bigint): void {
    if (value < 0n || value > MAX_SEQ) {
        throw new Error(`DTLS sequence_number out of range: ${value}`);
    }
    buf[offset] = Number((value >> 40n) & 0xffn);
    buf[offset + 1] = Number((value >> 32n) & 0xffn);
    buf[offset + 2] = Number((value >> 24n) & 0xffn);
    buf[offset + 3] = Number((value >> 16n) & 0xffn);
    buf[offset + 4] = Number((value >> 8n) & 0xffn);
    buf[offset + 5] = Number(value & 0xffn);
}

function readUint48BE(buf: Uint8Array, offset: number): bigint {
    let v = 0n;
    for (let i = 0; i < 6; i++) {
        v = (v << 8n) | BigInt(buf[offset + i]);
    }
    return v;
}

/**
 * DTLS 1.2 record-layer codec.
 *
 * `encode` frames a record as `header(13) || fragment`; for `epoch > 0` the fragment is
 * `explicit_nonce(8) || ciphertext(plaintext_len) || tag(8)` per RFC 6655 §3.
 *
 * `decode` parses one record off the front of the buffer and returns it together with
 * the number of consumed bytes, so a caller can split multiple records concatenated in
 * one UDP datagram. When the supplied state implements {@link DtlsRecordCipherState.acceptIncoming},
 * decode invokes it after AEAD success and throws {@link DtlsReplayError} on rejection.
 */
export namespace DtlsRecord {
    export function encode(record: DtlsRecord, state?: DtlsRecordCipherState): Uint8Array {
        if (record.epoch < 0 || record.epoch > MAX_EPOCH) {
            throw new Error(`DTLS epoch out of range: ${record.epoch}`);
        }
        if (record.sequenceNumber < 0n || record.sequenceNumber > MAX_SEQ) {
            throw new Error(`DTLS sequence_number out of range: ${record.sequenceNumber}`);
        }
        if (!isContentType(record.type)) {
            throw new Error(`DTLS unknown ContentType: ${record.type}`);
        }

        let fragment: Uint8Array;
        if (record.epoch === 0) {
            if (record.fragment.length > DTLS_MAX_FRAGMENT_LEN) {
                throw new Error(
                    `DTLS plaintext fragment too large: ${record.fragment.length} > ${DTLS_MAX_FRAGMENT_LEN}`,
                );
            }
            fragment = record.fragment;
        } else {
            if (state === undefined) {
                throw new Error(`DTLS encode at epoch ${record.epoch} requires cipher state`);
            }
            const plaintextLen = record.fragment.length;
            if (plaintextLen + DTLS_AEAD_OVERHEAD > DTLS_MAX_FRAGMENT_LEN) {
                throw new Error(
                    `DTLS encrypted fragment too large: ${plaintextLen + DTLS_AEAD_OVERHEAD} > ${DTLS_MAX_FRAGMENT_LEN}`,
                );
            }
            const { key, salt } = state.encryptParams();
            const nonce = state.nonceFor(salt, record.epoch, record.sequenceNumber);
            const aad = state.aadFor(record.type, record.epoch, record.sequenceNumber, plaintextLen);
            const cipherWithTag = AesCcm8.encrypt({ key, nonce, aad, plaintext: record.fragment });

            fragment = new Uint8Array(8 + cipherWithTag.length);
            // Explicit nonce on the wire mirrors the (epoch || seq) bytes of the AAD/nonce.
            fragment[0] = (record.epoch >>> 8) & 0xff;
            fragment[1] = record.epoch & 0xff;
            writeUint48BE(fragment, 2, record.sequenceNumber);
            fragment.set(cipherWithTag, 8);
        }

        const out = new Uint8Array(DTLS_HEADER_LEN + fragment.length);
        out[0] = record.type;
        out[1] = DTLS_1_2_VERSION.major;
        out[2] = DTLS_1_2_VERSION.minor;
        writeUint16BE(out, 3, record.epoch);
        writeUint48BE(out, 5, record.sequenceNumber);
        writeUint16BE(out, 11, fragment.length);
        out.set(fragment, DTLS_HEADER_LEN);
        return out;
    }

    export interface DecodeResult {
        record: DtlsRecord;
        consumed: number;
    }

    export function decode(bytes: Uint8Array, state?: DtlsRecordCipherState): DecodeResult {
        if (bytes.length < DTLS_HEADER_LEN) {
            throw new Error(`DTLS record header truncated: have ${bytes.length}, need ${DTLS_HEADER_LEN}`);
        }
        const type = bytes[0];
        if (!isContentType(type)) {
            throw new Error(`DTLS unknown ContentType: ${type}`);
        }
        const major = bytes[1];
        const minor = bytes[2];
        if (major !== DTLS_1_2_VERSION.major || minor !== DTLS_1_2_VERSION.minor) {
            throw new Error(
                `DTLS unsupported version ${major.toString(16)}.${minor.toString(16)}; only DTLS 1.2 is supported`,
            );
        }
        const epoch = readUint16BE(bytes, 3);
        const sequenceNumber = readUint48BE(bytes, 5);
        const length = readUint16BE(bytes, 11);
        if (length > DTLS_MAX_FRAGMENT_LEN) {
            throw new Error(`DTLS fragment length ${length} exceeds limit ${DTLS_MAX_FRAGMENT_LEN}`);
        }
        const total = DTLS_HEADER_LEN + length;
        if (bytes.length < total) {
            throw new Error(`DTLS record truncated: header says ${length}, have ${bytes.length - DTLS_HEADER_LEN}`);
        }

        let fragment: Uint8Array;
        if (epoch === 0) {
            fragment = bytes.slice(DTLS_HEADER_LEN, total);
        } else {
            if (state === undefined) {
                throw new Error(`DTLS decode at epoch ${epoch} requires cipher state`);
            }
            if (length < DTLS_AEAD_OVERHEAD) {
                throw new Error(`DTLS encrypted fragment ${length} bytes < ${DTLS_AEAD_OVERHEAD}-byte AEAD overhead`);
            }
            // Wire layout: explicit_nonce(8) || ciphertext(N) || tag(8); plaintext length is N.
            const explicitNonce = bytes.subarray(DTLS_HEADER_LEN, DTLS_HEADER_LEN + 8);
            const cipherWithTag = bytes.subarray(DTLS_HEADER_LEN + 8, total);
            const plaintextLen = cipherWithTag.length - 8;

            const { key, salt } = state.decryptParams();
            const wireEpoch = (explicitNonce[0] << 8) | explicitNonce[1];
            let wireSeq = 0n;
            for (let i = 2; i < 8; i++) {
                wireSeq = (wireSeq << 8n) | BigInt(explicitNonce[i]);
            }
            if (wireEpoch !== epoch || wireSeq !== sequenceNumber) {
                throw new Error(
                    `DTLS explicit nonce ${wireEpoch}/${wireSeq} disagrees with header ${epoch}/${sequenceNumber}`,
                );
            }
            const nonce = state.nonceFor(salt, epoch, sequenceNumber);
            const aad = state.aadFor(type, epoch, sequenceNumber, plaintextLen);
            fragment = AesCcm8.decrypt({ key, nonce, aad, ciphertextWithTag: cipherWithTag });
            // Anti-replay applies only to AEAD-protected records; epoch=0 plaintext has
            // no integrity check that a replay tracker could meaningfully gate.
            if (state.acceptIncoming !== undefined && !state.acceptIncoming(epoch, sequenceNumber)) {
                throw new DtlsReplayError(epoch, sequenceNumber);
            }
        }

        return {
            record: { type, epoch, sequenceNumber, fragment },
            consumed: total,
        };
    }
}
