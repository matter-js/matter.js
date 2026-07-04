/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StandardCrypto } from "@matter/general";
import { Bytes } from "@matter/main";
import { ContentType } from "../src/dtls/record/ContentType.js";
import {
    DTLS_1_2_VERSION,
    DTLS_HEADER_LEN,
    DTLS_MAX_FRAGMENT_LEN,
    DtlsRecord,
    type DtlsRecordCipherState,
} from "../src/dtls/record/DtlsRecord.js";

const crypto = new StandardCrypto();

/**
 * Minimal stand-in for {@link DtlsCipherState} used by record-level round-trip tests
 * before sub-task 3.2.3 introduces the full class. Mirrors the AAD/nonce layout from
 * RFC 6655 §3 so production code can later be substituted in unchanged.
 */
function buildStubState(): DtlsRecordCipherState {
    const writeKey = new Uint8Array(16).fill(0xa1);
    const writeSalt = new Uint8Array(4).fill(0xb2);
    return {
        encryptParams: () => ({ key: writeKey, salt: writeSalt }),
        decryptParams: () => ({ key: writeKey, salt: writeSalt }),
        nonceFor(salt, epoch, seq) {
            const out = new Uint8Array(12);
            out.set(salt, 0);
            out[4] = (epoch >>> 8) & 0xff;
            out[5] = epoch & 0xff;
            for (let i = 0; i < 6; i++) {
                out[6 + i] = Number((seq >> BigInt((5 - i) * 8)) & 0xffn);
            }
            return out;
        },
        aadFor(type, epoch, seq, plaintextLen) {
            const out = new Uint8Array(13);
            out[0] = (epoch >>> 8) & 0xff;
            out[1] = epoch & 0xff;
            for (let i = 0; i < 6; i++) {
                out[2 + i] = Number((seq >> BigInt((5 - i) * 8)) & 0xffn);
            }
            out[8] = type;
            out[9] = DTLS_1_2_VERSION.major;
            out[10] = DTLS_1_2_VERSION.minor;
            out[11] = (plaintextLen >>> 8) & 0xff;
            out[12] = plaintextLen & 0xff;
            return out;
        },
    };
}

describe("DtlsRecord plaintext (epoch=0)", () => {
    it("round-trips a HANDSHAKE record with no cipher state", async () => {
        const fragment = Bytes.of(Bytes.fromHex("0102030405060708"));
        const wire = await DtlsRecord.encode(crypto, {
            type: ContentType.HANDSHAKE,
            epoch: 0,
            sequenceNumber: 0n,
            fragment,
        });
        expect(wire.length).to.equal(DTLS_HEADER_LEN + fragment.length);
        // Header prefix matches the spec layout.
        expect(wire[0]).to.equal(ContentType.HANDSHAKE);
        expect(wire[1]).to.equal(0xfe);
        expect(wire[2]).to.equal(0xfd);
        expect(wire[3]).to.equal(0x00);
        expect(wire[4]).to.equal(0x00);
        // length field = 8
        expect((wire[11] << 8) | wire[12]).to.equal(8);

        const { record, consumed } = await DtlsRecord.decode(crypto, wire);
        expect(consumed).to.equal(wire.length);
        expect(record.type).to.equal(ContentType.HANDSHAKE);
        expect(record.epoch).to.equal(0);
        expect(record.sequenceNumber).to.equal(0n);
        expect(Bytes.areEqual(record.fragment, fragment)).to.equal(true);
    });

    it("round-trips a CHANGE_CIPHER_SPEC record at non-zero seq", async () => {
        const fragment = new Uint8Array([0x01]);
        const wire = await DtlsRecord.encode(crypto, {
            type: ContentType.CHANGE_CIPHER_SPEC,
            epoch: 0,
            sequenceNumber: 0x01_02_03_04_05_06n,
            fragment,
        });
        const { record } = await DtlsRecord.decode(crypto, wire);
        expect(record.type).to.equal(ContentType.CHANGE_CIPHER_SPEC);
        expect(record.sequenceNumber).to.equal(0x01_02_03_04_05_06n);
        expect(Bytes.areEqual(record.fragment, fragment)).to.equal(true);
    });

    it("rejects an unknown ContentType on encode", async () => {
        await expect(
            DtlsRecord.encode(crypto, {
                // ContentType is enforced by isContentType; cast through unknown to drive the throw.
                type: 99 as unknown as ContentType,
                epoch: 0,
                sequenceNumber: 0n,
                fragment: new Uint8Array(),
            }),
        ).to.be.rejectedWith(/ContentType/);
    });

    it("rejects an out-of-range epoch on encode", async () => {
        await expect(
            DtlsRecord.encode(crypto, {
                type: ContentType.HANDSHAKE,
                epoch: 0x10000,
                sequenceNumber: 0n,
                fragment: new Uint8Array(),
            }),
        ).to.be.rejectedWith(/epoch/);
    });

    it("rejects an out-of-range sequence_number on encode", async () => {
        await expect(
            DtlsRecord.encode(crypto, {
                type: ContentType.HANDSHAKE,
                epoch: 0,
                sequenceNumber: 1n << 48n,
                fragment: new Uint8Array(),
            }),
        ).to.be.rejectedWith(/sequence_number/);
    });

    it("rejects a header that says version 1.0", async () => {
        const wire = await DtlsRecord.encode(crypto, {
            type: ContentType.HANDSHAKE,
            epoch: 0,
            sequenceNumber: 0n,
            fragment: new Uint8Array(),
        });
        wire[1] = 0xfe;
        wire[2] = 0xff;
        await expect(DtlsRecord.decode(crypto, wire)).to.be.rejectedWith(/version/);
    });

    it("rejects a fragment shorter than the length field claims", async () => {
        const wire = await DtlsRecord.encode(crypto, {
            type: ContentType.HANDSHAKE,
            epoch: 0,
            sequenceNumber: 0n,
            fragment: new Uint8Array(8),
        });
        const truncated = wire.slice(0, wire.length - 1);
        await expect(DtlsRecord.decode(crypto, truncated)).to.be.rejectedWith(/truncated/);
    });

    it("rejects a header byte stream shorter than 13", async () => {
        await expect(DtlsRecord.decode(crypto, new Uint8Array(12))).to.be.rejectedWith(/header/);
    });

    it("returns consumed=total so two records concatenated decode in sequence", async () => {
        const a = await DtlsRecord.encode(crypto, {
            type: ContentType.HANDSHAKE,
            epoch: 0,
            sequenceNumber: 0n,
            fragment: Bytes.of(Bytes.fromHex("aaaa")),
        });
        const b = await DtlsRecord.encode(crypto, {
            type: ContentType.HANDSHAKE,
            epoch: 0,
            sequenceNumber: 1n,
            fragment: Bytes.of(Bytes.fromHex("bbbbbbbb")),
        });
        const concat = new Uint8Array(a.length + b.length);
        concat.set(a, 0);
        concat.set(b, a.length);
        const first = await DtlsRecord.decode(crypto, concat);
        expect(first.consumed).to.equal(a.length);
        const second = await DtlsRecord.decode(crypto, concat.subarray(first.consumed));
        expect(second.record.sequenceNumber).to.equal(1n);
        expect(Bytes.toHex(second.record.fragment)).to.equal("bbbbbbbb");
    });
});

describe("DtlsRecord encrypted (epoch=1)", () => {
    it("round-trips an APPLICATION_DATA record using the stub cipher state", async () => {
        const state = buildStubState();
        const plaintext = Bytes.of(Bytes.fromHex("deadbeefcafebabe1122"));
        const wire = await DtlsRecord.encode(
            crypto,
            {
                type: ContentType.APPLICATION_DATA,
                epoch: 1,
                sequenceNumber: 42n,
                fragment: plaintext,
            },
            state,
        );
        // Encrypted fragment = 8 explicit nonce + 10 ciphertext + 8 tag = 26 bytes
        expect(wire.length).to.equal(DTLS_HEADER_LEN + 8 + plaintext.length + 8);

        const { record } = await DtlsRecord.decode(crypto, wire, state);
        expect(record.type).to.equal(ContentType.APPLICATION_DATA);
        expect(record.epoch).to.equal(1);
        expect(record.sequenceNumber).to.equal(42n);
        expect(Bytes.areEqual(record.fragment, plaintext)).to.equal(true);
    });

    it("rejects a tampered tag during decode", async () => {
        const state = buildStubState();
        const wire = await DtlsRecord.encode(
            crypto,
            {
                type: ContentType.HANDSHAKE,
                epoch: 1,
                sequenceNumber: 5n,
                fragment: Bytes.of(Bytes.fromHex("00112233")),
            },
            state,
        );
        wire[wire.length - 1] ^= 0x01;
        await expect(DtlsRecord.decode(crypto, wire, state)).to.be.rejected;
    });

    it("rejects when explicit nonce on wire disagrees with header", async () => {
        const state = buildStubState();
        const wire = await DtlsRecord.encode(
            crypto,
            {
                type: ContentType.HANDSHAKE,
                epoch: 1,
                sequenceNumber: 5n,
                fragment: Bytes.of(Bytes.fromHex("00112233")),
            },
            state,
        );
        // Explicit nonce begins at byte 13 of the wire image; flip its low seq byte.
        wire[DTLS_HEADER_LEN + 7] ^= 0x01;
        await expect(DtlsRecord.decode(crypto, wire, state)).to.be.rejectedWith(/nonce/);
    });

    it("requires cipher state for epoch>0 encode", async () => {
        await expect(
            DtlsRecord.encode(crypto, {
                type: ContentType.HANDSHAKE,
                epoch: 1,
                sequenceNumber: 0n,
                fragment: new Uint8Array(),
            }),
        ).to.be.rejectedWith(/cipher state/);
    });

    it("requires cipher state for epoch>0 decode", async () => {
        const state = buildStubState();
        const wire = await DtlsRecord.encode(
            crypto,
            {
                type: ContentType.HANDSHAKE,
                epoch: 1,
                sequenceNumber: 0n,
                fragment: new Uint8Array(),
            },
            state,
        );
        await expect(DtlsRecord.decode(crypto, wire)).to.be.rejectedWith(/cipher state/);
    });

    it("rejects an encrypted fragment shorter than 16 bytes (8 nonce + 8 tag)", async () => {
        // Hand-build an epoch=1 record whose length field claims 10.
        const wire = new Uint8Array(DTLS_HEADER_LEN + 10);
        wire[0] = ContentType.HANDSHAKE;
        wire[1] = 0xfe;
        wire[2] = 0xfd;
        wire[3] = 0x00;
        wire[4] = 0x01; // epoch = 1
        wire[11] = 0x00;
        wire[12] = 0x0a;
        const state = buildStubState();
        await expect(DtlsRecord.decode(crypto, wire, state)).to.be.rejectedWith(/AEAD overhead/);
    });

    it("rejects an outsized length field on decode", async () => {
        const wire = new Uint8Array(DTLS_HEADER_LEN);
        wire[0] = ContentType.HANDSHAKE;
        wire[1] = 0xfe;
        wire[2] = 0xfd;
        wire[11] = 0xff;
        wire[12] = 0xff;
        await expect(DtlsRecord.decode(crypto, wire)).to.be.rejectedWith(/exceeds limit/);
    });

    it("encode bounds-checks plaintext + AEAD overhead against the 16K record limit", async () => {
        const state = buildStubState();
        // Largest plaintext that still fits in the record: 16384 - 16 = 16368
        const ok = new Uint8Array(DTLS_MAX_FRAGMENT_LEN - 16);
        await DtlsRecord.encode(
            crypto,
            { type: ContentType.APPLICATION_DATA, epoch: 1, sequenceNumber: 0n, fragment: ok },
            state,
        );
        const tooBig = new Uint8Array(DTLS_MAX_FRAGMENT_LEN - 15);
        await expect(
            DtlsRecord.encode(
                crypto,
                { type: ContentType.APPLICATION_DATA, epoch: 1, sequenceNumber: 0n, fragment: tooBig },
                state,
            ),
        ).to.be.rejectedWith(/too large/);
    });
});
