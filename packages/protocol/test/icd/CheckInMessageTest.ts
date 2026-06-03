/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CheckInMessage } from "#icd/CheckInMessage.js";
import { Bytes, StandardCrypto, UnexpectedDataError } from "@matter/general";

const crypto = new StandardCrypto();

/** Test vectors from CHIP SDK src/protocols/secure_channel/tests/CheckIn_Message_test_vectors.h */
const VECTORS = [
    {
        // vector 1 — empty application data
        key: Bytes.fromHex("d90e13180d00baadd20cf5ed4913d3ff"),
        applicationData: Bytes.fromHex(""),
        counter: 12,
        nonce: Bytes.fromHex("4580d2c6f1310dc4eb64f1f8e8"),
        payload: Bytes.fromHex("4580d2c6f1310dc4eb64f1f8e8bdc21fb5195d747dd2879b2b0d43ce5b1c565078"),
    },
    {
        // vector 2 — 4 bytes application data ("This")
        key: Bytes.fromHex("18fdbceaef01955b0ec875eda3ae6ee8"),
        applicationData: Bytes.fromHex("54686973"),
        counter: 15,
        nonce: Bytes.fromHex("9b02ed21ee0c7b491985502e37"),
        payload: Bytes.fromHex("9b02ed21ee0c7b491985502e372dbd7b3f8b4f8e3c5ad99419389f41a8d609938c67a86d65"),
    },
    {
        // vector 3 — 9 bytes application data
        key: Bytes.fromHex("d90e13180d00baadd20cf5ed4913d3ff"),
        applicationData: Bytes.fromHex("546869732069732061"),
        counter: 11,
        nonce: Bytes.fromHex("aa84bc60886a63a8475d5dbeb5"),
        payload: Bytes.fromHex("aa84bc60886a63a8475d5dbeb56d635fa95285ae33626613c7636ce3e3b2a8b13a8c89bef76891e8e296"),
    },
];

describe("CheckInMessage", () => {
    describe("generateNonce", () => {
        for (const [i, v] of VECTORS.entries()) {
            it(`matches vector ${i + 1}`, async () => {
                const nonce = await CheckInMessage.generateNonce(crypto, v.key, v.counter);
                expect(Bytes.areEqual(nonce, v.nonce)).true;
            });
        }
    });

    describe("encode", () => {
        for (const [i, v] of VECTORS.entries()) {
            it(`matches vector ${i + 1}`, async () => {
                const payload = await CheckInMessage.encode(crypto, v.key, v.counter, v.applicationData);
                expect(Bytes.areEqual(payload, v.payload)).true;
            });
        }
    });

    describe("decode", () => {
        for (const [i, v] of VECTORS.entries()) {
            it(`recovers counter and applicationData for vector ${i + 1}`, async () => {
                const decoded = await CheckInMessage.decode(crypto, v.key, v.payload);
                expect(decoded.counter).equal(v.counter);
                expect(Bytes.areEqual(decoded.applicationData, v.applicationData)).true;
            });
        }

        it("rejects tampered nonce (first byte flipped)", async () => {
            const v = VECTORS[0];
            const tampered = Bytes.of(v.payload).slice();
            tampered[0] ^= 0xff;
            await expect(CheckInMessage.decode(crypto, v.key, tampered)).rejectedWith(UnexpectedDataError);
        });

        it("rejects tampered ciphertext (last byte flipped)", async () => {
            const v = VECTORS[0];
            const tampered = Bytes.of(v.payload).slice();
            tampered[tampered.length - 1] ^= 0xff;
            await expect(CheckInMessage.decode(crypto, v.key, tampered)).rejectedWith(UnexpectedDataError);
        });

        it("rejects wrong key (all-zero 16 bytes)", async () => {
            const v = VECTORS[0];
            const wrongKey = new Uint8Array(16);
            await expect(CheckInMessage.decode(crypto, wrongKey, v.payload)).rejectedWith(UnexpectedDataError);
        });

        it("rejects too-short payload (2 bytes)", async () => {
            const v = VECTORS[0];
            await expect(CheckInMessage.decode(crypto, v.key, new Uint8Array(2))).rejectedWith(UnexpectedDataError);
        });
    });

    describe("encodeIcd / decodeIcd", () => {
        it("round-trips counter and activeModeThreshold", async () => {
            const key = VECTORS[0].key;
            const payload = await CheckInMessage.encodeIcd(crypto, key, 42, 5000);
            const decoded = await CheckInMessage.decodeIcd(crypto, key, payload);
            expect(decoded.counter).equal(42);
            expect(decoded.activeModeThreshold).equal(5000);
        });

        it("rejects applicationData shorter than 2 bytes", async () => {
            const key = VECTORS[0].key;
            const payload = await CheckInMessage.encode(crypto, key, VECTORS[0].counter, Bytes.fromHex("01"));
            await expect(CheckInMessage.decodeIcd(crypto, key, payload)).rejectedWith(UnexpectedDataError);
        });
    });

    describe("validateCounter", () => {
        it("valid, not needing refresh: counter 15, start 10, lastOffset 2", () => {
            const result = CheckInMessage.validateCounter(15, { counterStart: 10, lastOffset: 2 });
            expect(result.valid).true;
            expect(result.offset).equal(5);
            expect(result.refreshNeeded).false;
        });

        it("invalid (replay): counter 12, start 10, lastOffset 2", () => {
            const result = CheckInMessage.validateCounter(12, { counterStart: 10, lastOffset: 2 });
            expect(result.valid).false;
        });

        it("invalid (stale): counter 11, start 10, lastOffset 2", () => {
            const result = CheckInMessage.validateCounter(11, { counterStart: 10, lastOffset: 2 });
            expect(result.valid).false;
        });

        it("valid with uint32 wrap: counter 5, start 0xfffffffa, lastOffset 1", () => {
            const result = CheckInMessage.validateCounter(5, { counterStart: 0xfffffffa, lastOffset: 1 });
            expect(result.valid).true;
            expect(result.offset).equal(11);
        });

        it("valid, refresh needed: counter 0x80000001, start 1, lastOffset 5", () => {
            const result = CheckInMessage.validateCounter(0x80000001, { counterStart: 1, lastOffset: 5 });
            expect(result.valid).true;
            expect(result.refreshNeeded).true;
        });
    });
});
