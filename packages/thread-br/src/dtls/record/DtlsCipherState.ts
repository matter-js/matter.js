/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { AntiReplayWindow } from "./AntiReplayWindow.js";
import { ContentType } from "./ContentType.js";
import { DTLS_1_2_VERSION, type DtlsRecordCipherState } from "./DtlsRecord.js";

/**
 * Materials a TLS 1.2 key block produces for `*_WITH_AES_128_CCM_8` (RFC 6655 §3,
 * RFC 5246 §6.3): two AES-128 keys (`{client,server}_write_key`) and two 4-byte
 * implicit-IV salts (`{client,server}_write_IV`). The PRF that derives them lands
 * in sub-batch 4; sub-batch 2 only consumes the four byte arrays.
 */
export interface DtlsCipherStateInputs {
    /** 16-byte AES key the client uses to encrypt outbound records. */
    clientWriteKey: Uint8Array;
    /** 16-byte AES key the server uses to encrypt outbound records. */
    serverWriteKey: Uint8Array;
    /** 4-byte client implicit-IV salt (`client_write_IV`). */
    clientWriteSalt: Uint8Array;
    /** 4-byte server implicit-IV salt (`server_write_IV`). */
    serverWriteSalt: Uint8Array;
}

const KEY_LEN = 16;
const SALT_LEN = 4;
const NONCE_LEN = 12;
const AAD_LEN = 13;
const MAX_EPOCH = 0xffff;
const MAX_SEQ = (1n << 48n) - 1n;

function copyExpect(name: string, value: Uint8Array, expectedLen: number): Uint8Array {
    if (value.length !== expectedLen) {
        throw new Error(`DtlsCipherState ${name} must be ${expectedLen} bytes, got ${value.length}`);
    }
    return new Uint8Array(value);
}

/**
 * Per-connection DTLS 1.2 record-layer cipher state for `TLS_ECJPAKE_WITH_AES_128_CCM_8`.
 *
 * Holds:
 * - the four key-block byte arrays,
 * - the local role (controls which write key/salt is used for encrypt vs decrypt),
 * - per-direction epoch and sequence counters,
 * - and a per-read-epoch {@link AntiReplayWindow} (RFC 6347 §4.1.2.6).
 *
 * Both epochs start at 0 (plaintext handshake records). After ChangeCipherSpec the
 * sender bumps its own epoch and resets its sequence counter to 0; the handshake
 * layer drives that via {@link advanceWriteEpoch} / {@link advanceReadEpoch}. The
 * read window is allocated lazily for any epoch > 0 because plaintext records carry
 * no AEAD tag and therefore cannot meaningfully participate in anti-replay.
 */
export class DtlsCipherState implements DtlsRecordCipherState {
    readonly role: "client" | "server";
    readonly #clientWriteKey: Uint8Array;
    readonly #serverWriteKey: Uint8Array;
    readonly #clientWriteSalt: Uint8Array;
    readonly #serverWriteSalt: Uint8Array;
    #writeEpoch = 0;
    #writeSeq = 0n;
    #readEpoch = 0;
    #readWindow: AntiReplayWindow | undefined;

    constructor(role: "client" | "server", inputs: DtlsCipherStateInputs) {
        this.role = role;
        this.#clientWriteKey = copyExpect("clientWriteKey", inputs.clientWriteKey, KEY_LEN);
        this.#serverWriteKey = copyExpect("serverWriteKey", inputs.serverWriteKey, KEY_LEN);
        this.#clientWriteSalt = copyExpect("clientWriteSalt", inputs.clientWriteSalt, SALT_LEN);
        this.#serverWriteSalt = copyExpect("serverWriteSalt", inputs.serverWriteSalt, SALT_LEN);
    }

    get writeEpoch(): number {
        return this.#writeEpoch;
    }

    get readEpoch(): number {
        return this.#readEpoch;
    }

    /** Most recently allocated outbound seq, or `-1n` before the first allocation in the current epoch. */
    get lastWriteSeq(): bigint {
        return this.#writeSeq - 1n;
    }

    /**
     * Allocate the next outbound sequence number for the current write epoch and bump
     * the counter. Throws if the 48-bit space is exhausted within an epoch.
     */
    nextWriteSeq(): bigint {
        if (this.#writeSeq > MAX_SEQ) {
            throw new Error(`DtlsCipherState write sequence_number space exhausted at epoch ${this.#writeEpoch}`);
        }
        const seq = this.#writeSeq;
        this.#writeSeq += 1n;
        return seq;
    }

    /**
     * Increment the outbound epoch (called once after sending ChangeCipherSpec) and reset
     * the seq counter to 0 (RFC 6347 §4.1.2.5).
     */
    advanceWriteEpoch(): void {
        if (this.#writeEpoch >= MAX_EPOCH) {
            throw new Error(`DtlsCipherState write epoch overflow`);
        }
        this.#writeEpoch += 1;
        this.#writeSeq = 0n;
    }

    /**
     * Increment the inbound epoch (called once after receiving ChangeCipherSpec) and
     * reset the read-side anti-replay window for the new epoch.
     */
    advanceReadEpoch(): void {
        if (this.#readEpoch >= MAX_EPOCH) {
            throw new Error(`DtlsCipherState read epoch overflow`);
        }
        this.#readEpoch += 1;
        this.#readWindow = new AntiReplayWindow();
    }

    /**
     * Test+mark an inbound (epoch, seqNum) pair. Returns false on replay or wrong epoch
     * so callers can drop the record per RFC 6347 §4.1.2.6. Plaintext epoch=0 records
     * are accepted unconditionally — they carry no MAC and replay is meaningless.
     */
    acceptIncoming(epoch: number, seqNum: bigint): boolean {
        if (epoch !== this.#readEpoch) {
            return false;
        }
        if (epoch === 0) {
            return true;
        }
        if (this.#readWindow === undefined) {
            this.#readWindow = new AntiReplayWindow();
        }
        return this.#readWindow.check(seqNum);
    }

    encryptParams(): { key: Uint8Array; salt: Uint8Array } {
        return this.role === "client"
            ? { key: this.#clientWriteKey, salt: this.#clientWriteSalt }
            : { key: this.#serverWriteKey, salt: this.#serverWriteSalt };
    }

    decryptParams(): { key: Uint8Array; salt: Uint8Array } {
        return this.role === "client"
            ? { key: this.#serverWriteKey, salt: this.#serverWriteSalt }
            : { key: this.#clientWriteKey, salt: this.#clientWriteSalt };
    }

    nonceFor(salt: Uint8Array, epoch: number, seqNum: bigint): Uint8Array {
        if (salt.length !== SALT_LEN) {
            throw new Error(`DtlsCipherState nonceFor: salt must be ${SALT_LEN} bytes, got ${salt.length}`);
        }
        if (epoch < 0 || epoch > MAX_EPOCH) {
            throw new Error(`DtlsCipherState nonceFor: epoch ${epoch} out of range`);
        }
        if (seqNum < 0n || seqNum > MAX_SEQ) {
            throw new Error(`DtlsCipherState nonceFor: seqNum ${seqNum} out of range`);
        }
        const out = new Uint8Array(NONCE_LEN);
        out.set(salt, 0);
        out[4] = (epoch >>> 8) & 0xff;
        out[5] = epoch & 0xff;
        for (let i = 0; i < 6; i++) {
            out[6 + i] = Number((seqNum >> BigInt((5 - i) * 8)) & 0xffn);
        }
        return out;
    }

    aadFor(type: ContentType, epoch: number, seqNum: bigint, plaintextLen: number): Uint8Array {
        if (epoch < 0 || epoch > MAX_EPOCH) {
            throw new Error(`DtlsCipherState aadFor: epoch ${epoch} out of range`);
        }
        if (seqNum < 0n || seqNum > MAX_SEQ) {
            throw new Error(`DtlsCipherState aadFor: seqNum ${seqNum} out of range`);
        }
        if (plaintextLen < 0 || plaintextLen > 0xffff) {
            throw new Error(`DtlsCipherState aadFor: plaintextLen ${plaintextLen} out of range`);
        }
        const out = new Uint8Array(AAD_LEN);
        out[0] = (epoch >>> 8) & 0xff;
        out[1] = epoch & 0xff;
        for (let i = 0; i < 6; i++) {
            out[2 + i] = Number((seqNum >> BigInt((5 - i) * 8)) & 0xffn);
        }
        out[8] = type;
        out[9] = DTLS_1_2_VERSION.major;
        out[10] = DTLS_1_2_VERSION.minor;
        out[11] = (plaintextLen >>> 8) & 0xff;
        out[12] = plaintextLen & 0xff;
        return out;
    }
}
