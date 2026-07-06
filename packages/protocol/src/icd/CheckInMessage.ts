/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Crypto } from "@matter/general";
import { Bytes, DataReader, DataWriter, Endian, UnexpectedDataError } from "@matter/general";

const NONCE_LENGTH = 13;
const MIC_LENGTH = 16;
const COUNTER_LENGTH = 4;
const MIN_PAYLOAD_LENGTH = NONCE_LENGTH + COUNTER_LENGTH + MIC_LENGTH;

/**
 * The counter offset at which a key refresh must be initiated.
 *
 * @see {@link MatterSpecification.v16.Core} § 4.22.3.4.1
 */
const KEY_REFRESH_OFFSET = 0x80000000;

/**
 * Check-In Protocol message codec and counter validation.
 *
 * Payload wire layout: nonce(13) ‖ AES-128-CCM(counter LE32 ‖ applicationData) ‖ MIC(16).
 * Nonce = first 13 bytes of HMAC-SHA256(key, counter LE32).
 *
 * @see {@link MatterSpecification.v16.Core} § 4.22.3.1
 */
export class CheckInMessage {
    /**
     * Derives the 13-byte nonce from the HMAC-SHA256 of the counter.
     *
     * @see {@link MatterSpecification.v16.Core} § 4.22.3.1
     */
    static async generateNonce(crypto: Crypto, key: Bytes, counter: number): Promise<Uint8Array> {
        const counterBytes = CheckInMessage.#counterToBytes(counter);
        const hmac = await crypto.signHmac(key, counterBytes);
        return Bytes.of(hmac).subarray(0, NONCE_LENGTH);
    }

    /**
     * Encodes a Check-In payload: nonce ‖ AES-128-CCM(counter LE32 ‖ applicationData).
     */
    static async encode(crypto: Crypto, key: Bytes, counter: number, applicationData: Bytes): Promise<Bytes> {
        const nonce = await CheckInMessage.generateNonce(crypto, key, counter);
        const plaintext = Bytes.concat(CheckInMessage.#counterToBytes(counter), applicationData);
        const ciphertext = crypto.encrypt(key, plaintext, nonce);
        return Bytes.concat(nonce, ciphertext);
    }

    /**
     * Decodes a Check-In payload and authenticates it.
     *
     * Throws {@link UnexpectedDataError} on length violations, decryption failure, or nonce mismatch.
     *
     * @see {@link MatterSpecification.v16.Core} § 4.22.4.2
     */
    static async decode(crypto: Crypto, key: Bytes, payload: Bytes): Promise<CheckInMessage.DecodedCheckIn> {
        const data = Bytes.of(payload);
        if (data.length < MIN_PAYLOAD_LENGTH) {
            throw new UnexpectedDataError(`Check-In payload too short: ${data.length} < ${MIN_PAYLOAD_LENGTH}`);
        }

        const nonce = data.subarray(0, NONCE_LENGTH);
        const ciphertext = data.subarray(NONCE_LENGTH);

        let plaintext: Bytes;
        try {
            plaintext = crypto.decrypt(key, ciphertext, nonce);
        } catch (e) {
            throw new UnexpectedDataError("Check-In message decryption failed", { cause: e });
        }

        const reader = new DataReader(plaintext, Endian.Little);
        const counter = reader.readUInt32();
        const applicationData = reader.remainingBytes;

        const expectedNonce = await CheckInMessage.generateNonce(crypto, key, counter);
        if (!Bytes.areEqual(nonce, expectedNonce)) {
            throw new UnexpectedDataError("Check-In nonce does not match counter");
        }

        return { counter, applicationData };
    }

    /**
     * Encodes an ICD-specific Check-In payload where applicationData encodes activeModeThreshold as uint16 LE.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.15.1.3.3
     */
    static async encodeIcd(crypto: Crypto, key: Bytes, counter: number, activeModeThreshold: number): Promise<Bytes> {
        const writer = new DataWriter(Endian.Little);
        writer.writeUInt16(activeModeThreshold);
        return CheckInMessage.encode(crypto, key, counter, writer.toByteArray());
    }

    /**
     * Decodes an ICD-specific Check-In payload, recovering counter and activeModeThreshold.
     *
     * Throws {@link UnexpectedDataError} if applicationData is shorter than 2 bytes.
     *
     * @see {@link MatterSpecification.v16.Core} § 9.15.1.3.3
     */
    static async decodeIcd(crypto: Crypto, key: Bytes, payload: Bytes): Promise<CheckInMessage.DecodedIcdCheckIn> {
        const { counter, applicationData } = await CheckInMessage.decode(crypto, key, payload);
        const appData = Bytes.of(applicationData);
        if (appData.length < 2) {
            throw new UnexpectedDataError(
                `ICD Check-In applicationData too short for activeModeThreshold: ${appData.length} < 2`,
            );
        }
        const activeModeThreshold = new DataReader(appData, Endian.Little).readUInt16();
        return { counter, activeModeThreshold };
    }

    /**
     * Validates a received counter against rolling state, returning whether it is fresh and whether a key refresh
     * is needed.
     *
     * @see {@link MatterSpecification.v16.Core} § 4.22.3.4.1
     */
    static validateCounter(counter: number, state: CheckInMessage.CounterState): CheckInMessage.CounterValidation {
        const offset = (counter - state.counterStart) >>> 0;
        const valid = offset > state.lastOffset;
        const refreshNeeded = offset >= KEY_REFRESH_OFFSET;
        return { valid, offset, refreshNeeded };
    }

    static #counterToBytes(counter: number): Uint8Array {
        const writer = new DataWriter(Endian.Little);
        writer.writeUInt32(counter);
        return writer.toByteArray();
    }
}

export namespace CheckInMessage {
    /** Decoded Check-In message. */
    export interface DecodedCheckIn {
        counter: number;
        applicationData: Bytes;
    }

    /** Decoded ICD Check-In message. */
    export interface DecodedIcdCheckIn {
        counter: number;
        activeModeThreshold: number;
    }

    /**
     * Rolling counter state used to validate that incoming Check-In counters are not replays and to detect
     * when the key pair must be refreshed.
     *
     * @see {@link MatterSpecification.v16.Core} § 4.22.3.4.1
     */
    export interface CounterState {
        /** The counter value received when the ICD was first registered or the key was last refreshed. */
        counterStart: number;
        /** The unsigned offset of the last accepted counter from counterStart. */
        lastOffset: number;
    }

    /** Result of {@link CheckInMessage.validateCounter}. */
    export interface CounterValidation {
        /** Whether the counter is fresh (not a replay and within the valid window). */
        valid: boolean;
        /** Unsigned distance from counterStart to counter, wrapping at 2^32. */
        offset: number;
        /** True when offset ≥ 2^31; the caller must trigger a key refresh. */
        refreshNeeded: boolean;
    }
}
