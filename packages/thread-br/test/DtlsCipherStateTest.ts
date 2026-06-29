/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { ContentType } from "../src/dtls/record/ContentType.js";
import { DtlsCipherState, type DtlsCipherStateInputs } from "../src/dtls/record/DtlsCipherState.js";
import { DtlsRecord, DtlsReplayError } from "../src/dtls/record/DtlsRecord.js";

const FIXED_INPUTS: DtlsCipherStateInputs = {
    clientWriteKey: Bytes.of(Bytes.fromHex("000102030405060708090a0b0c0d0e0f")),
    serverWriteKey: Bytes.of(Bytes.fromHex("101112131415161718191a1b1c1d1e1f")),
    clientWriteSalt: Bytes.of(Bytes.fromHex("c0c1c2c3")),
    serverWriteSalt: Bytes.of(Bytes.fromHex("d0d1d2d3")),
};

describe("DtlsCipherState role-based key/salt selection", () => {
    it("client encrypts with client_write_key/salt, decrypts with server_write_key/salt", () => {
        const state = new DtlsCipherState("client", FIXED_INPUTS);
        expect(Bytes.toHex(state.encryptParams().key)).to.equal(Bytes.toHex(FIXED_INPUTS.clientWriteKey));
        expect(Bytes.toHex(state.encryptParams().salt)).to.equal(Bytes.toHex(FIXED_INPUTS.clientWriteSalt));
        expect(Bytes.toHex(state.decryptParams().key)).to.equal(Bytes.toHex(FIXED_INPUTS.serverWriteKey));
        expect(Bytes.toHex(state.decryptParams().salt)).to.equal(Bytes.toHex(FIXED_INPUTS.serverWriteSalt));
    });

    it("server encrypts with server_write_key/salt, decrypts with client_write_key/salt", () => {
        const state = new DtlsCipherState("server", FIXED_INPUTS);
        expect(Bytes.toHex(state.encryptParams().key)).to.equal(Bytes.toHex(FIXED_INPUTS.serverWriteKey));
        expect(Bytes.toHex(state.encryptParams().salt)).to.equal(Bytes.toHex(FIXED_INPUTS.serverWriteSalt));
        expect(Bytes.toHex(state.decryptParams().key)).to.equal(Bytes.toHex(FIXED_INPUTS.clientWriteKey));
        expect(Bytes.toHex(state.decryptParams().salt)).to.equal(Bytes.toHex(FIXED_INPUTS.clientWriteSalt));
    });

    it("defensively copies key-block inputs", () => {
        const inputs: DtlsCipherStateInputs = {
            clientWriteKey: new Uint8Array(16),
            serverWriteKey: new Uint8Array(16),
            clientWriteSalt: new Uint8Array(4),
            serverWriteSalt: new Uint8Array(4),
        };
        const state = new DtlsCipherState("client", inputs);
        inputs.clientWriteKey.fill(0xff);
        inputs.clientWriteSalt.fill(0xff);
        expect(Bytes.toHex(state.encryptParams().key)).to.equal("00000000000000000000000000000000");
        expect(Bytes.toHex(state.encryptParams().salt)).to.equal("00000000");
    });

    it("rejects key/salt of wrong length", () => {
        expect(
            () =>
                new DtlsCipherState("client", {
                    ...FIXED_INPUTS,
                    clientWriteKey: new Uint8Array(15),
                }),
        ).to.throw(/clientWriteKey/);
        expect(
            () =>
                new DtlsCipherState("client", {
                    ...FIXED_INPUTS,
                    serverWriteSalt: new Uint8Array(5),
                }),
        ).to.throw(/serverWriteSalt/);
    });
});

describe("DtlsCipherState.nonceFor", () => {
    const state = new DtlsCipherState("client", FIXED_INPUTS);

    it("matches salt(4) || epoch(2) || seq(6) for epoch=1 seq=42", () => {
        const nonce = state.nonceFor(FIXED_INPUTS.clientWriteSalt, 1, 42n);
        expect(Bytes.toHex(nonce)).to.equal("c0c1c2c3" + "0001" + "00000000002a");
    });

    it("uses BE for the 48-bit sequence number", () => {
        const nonce = state.nonceFor(FIXED_INPUTS.serverWriteSalt, 0xabcd, 0x123456789a_bcn);
        expect(Bytes.toHex(nonce)).to.equal("d0d1d2d3" + "abcd" + "123456789abc");
    });

    it("rejects salt of wrong length", () => {
        expect(() => state.nonceFor(new Uint8Array(3), 0, 0n)).to.throw(/salt/);
    });

    it("rejects out-of-range epoch and seqNum", () => {
        expect(() => state.nonceFor(FIXED_INPUTS.clientWriteSalt, -1, 0n)).to.throw(/epoch/);
        expect(() => state.nonceFor(FIXED_INPUTS.clientWriteSalt, 0x10000, 0n)).to.throw(/epoch/);
        expect(() => state.nonceFor(FIXED_INPUTS.clientWriteSalt, 0, 1n << 48n)).to.throw(/seqNum/);
    });
});

describe("DtlsCipherState.aadFor", () => {
    const state = new DtlsCipherState("client", FIXED_INPUTS);

    it("matches epoch||seq(8) || type(1) || version(2) || plaintextLen(2)", () => {
        const aad = state.aadFor(ContentType.APPLICATION_DATA, 1, 42n, 100);
        // 0001 00000000002a 17 fefd 0064
        expect(Bytes.toHex(aad)).to.equal("0001" + "00000000002a" + "17" + "fefd" + "0064");
        expect(aad.length).to.equal(13);
    });

    it("reflects ContentType byte verbatim", () => {
        const aad = state.aadFor(ContentType.HANDSHAKE, 0, 7n, 1);
        expect(aad[8]).to.equal(22);
        expect(aad[11]).to.equal(0x00);
        expect(aad[12]).to.equal(0x01);
    });

    it("rejects out-of-range plaintextLen", () => {
        expect(() => state.aadFor(ContentType.HANDSHAKE, 0, 0n, -1)).to.throw(/plaintextLen/);
        expect(() => state.aadFor(ContentType.HANDSHAKE, 0, 0n, 0x10000)).to.throw(/plaintextLen/);
    });
});

/**
 * Build a paired (client, server) state from the same key block so the two halves can
 * exchange records end-to-end. The client encrypts with `clientWriteKey` and the server
 * with `serverWriteKey`, and `decryptParams` on each peer points at the other peer's
 * write key — this is exactly the layout the TLS 1.2 PRF will produce in sub-batch 4.
 */
function pairStates(): { client: DtlsCipherState; server: DtlsCipherState } {
    return {
        client: new DtlsCipherState("client", FIXED_INPUTS),
        server: new DtlsCipherState("server", FIXED_INPUTS),
    };
}

describe("DtlsCipherState sequence + epoch counters", () => {
    it("starts at writeEpoch=0, readEpoch=0, lastWriteSeq=-1", () => {
        const s = new DtlsCipherState("client", FIXED_INPUTS);
        expect(s.writeEpoch).to.equal(0);
        expect(s.readEpoch).to.equal(0);
        expect(s.lastWriteSeq).to.equal(-1n);
    });

    it("nextWriteSeq returns 0,1,2,... and updates lastWriteSeq", () => {
        const s = new DtlsCipherState("client", FIXED_INPUTS);
        expect(s.nextWriteSeq()).to.equal(0n);
        expect(s.nextWriteSeq()).to.equal(1n);
        expect(s.nextWriteSeq()).to.equal(2n);
        expect(s.lastWriteSeq).to.equal(2n);
    });

    it("advanceWriteEpoch bumps epoch and resets seq", () => {
        const s = new DtlsCipherState("client", FIXED_INPUTS);
        s.nextWriteSeq();
        s.nextWriteSeq();
        s.advanceWriteEpoch();
        expect(s.writeEpoch).to.equal(1);
        expect(s.lastWriteSeq).to.equal(-1n);
        expect(s.nextWriteSeq()).to.equal(0n);
    });

    it("advanceReadEpoch bumps epoch and creates a fresh anti-replay window", () => {
        const s = new DtlsCipherState("client", FIXED_INPUTS);
        s.advanceReadEpoch();
        expect(s.readEpoch).to.equal(1);
        expect(s.acceptIncoming(1, 0n)).to.equal(true);
        expect(s.acceptIncoming(1, 0n)).to.equal(false);
    });

    it("acceptIncoming rejects records from a different epoch", () => {
        const s = new DtlsCipherState("client", FIXED_INPUTS);
        s.advanceReadEpoch();
        expect(s.acceptIncoming(0, 0n)).to.equal(false);
        expect(s.acceptIncoming(2, 0n)).to.equal(false);
    });

    it("acceptIncoming on epoch=0 always returns true (plaintext has no MAC)", () => {
        const s = new DtlsCipherState("client", FIXED_INPUTS);
        expect(s.acceptIncoming(0, 0n)).to.equal(true);
        expect(s.acceptIncoming(0, 0n)).to.equal(true);
        expect(s.acceptIncoming(0, 1234n)).to.equal(true);
    });
});

describe("DtlsRecord + DtlsCipherState end-to-end (epoch=1)", () => {
    function bumpToEpoch1(client: DtlsCipherState, server: DtlsCipherState): void {
        client.advanceWriteEpoch();
        client.advanceReadEpoch();
        server.advanceWriteEpoch();
        server.advanceReadEpoch();
    }

    it("encrypt at epoch=1 seq=0 with client state -> decrypt with server state", () => {
        const { client, server } = pairStates();
        bumpToEpoch1(client, server);
        const plaintext = Bytes.of(Bytes.fromHex("a0a1a2a3a4a5"));
        const seq = client.nextWriteSeq();
        expect(seq).to.equal(0n);
        const wire = DtlsRecord.encode(
            { type: ContentType.APPLICATION_DATA, epoch: client.writeEpoch, sequenceNumber: seq, fragment: plaintext },
            client,
        );
        const { record } = DtlsRecord.decode(wire, server);
        expect(record.epoch).to.equal(1);
        expect(record.sequenceNumber).to.equal(0n);
        expect(Bytes.areEqual(record.fragment, plaintext)).to.equal(true);
    });

    it("tag tamper -> decode throws (auth failure, not DtlsReplayError)", () => {
        const { client, server } = pairStates();
        bumpToEpoch1(client, server);
        const wire = DtlsRecord.encode(
            {
                type: ContentType.APPLICATION_DATA,
                epoch: 1,
                sequenceNumber: client.nextWriteSeq(),
                fragment: Bytes.of(Bytes.fromHex("11223344")),
            },
            client,
        );
        wire[wire.length - 1] ^= 0x01;
        let thrown: unknown;
        try {
            DtlsRecord.decode(wire, server);
        } catch (e) {
            thrown = e;
        }
        expect(thrown instanceof Error).to.equal(true);
        expect(thrown instanceof DtlsReplayError).to.equal(false);
    });

    it("replay -> decode throws DtlsReplayError on second delivery of the same record", () => {
        const { client, server } = pairStates();
        bumpToEpoch1(client, server);
        const wire = DtlsRecord.encode(
            {
                type: ContentType.APPLICATION_DATA,
                epoch: 1,
                sequenceNumber: client.nextWriteSeq(),
                fragment: Bytes.of(Bytes.fromHex("aabbcc")),
            },
            client,
        );
        // First delivery succeeds.
        const first = DtlsRecord.decode(wire, server);
        expect(first.record.sequenceNumber).to.equal(0n);
        // Replay of the identical bytes is rejected.
        let thrown: unknown;
        try {
            DtlsRecord.decode(wire, server);
        } catch (e) {
            thrown = e;
        }
        expect(thrown instanceof DtlsReplayError).to.equal(true);
        if (thrown instanceof DtlsReplayError) {
            expect(thrown.epoch).to.equal(1);
            expect(thrown.sequenceNumber).to.equal(0n);
        }
    });

    it("out-of-order within window is accepted exactly once", () => {
        const { client, server } = pairStates();
        bumpToEpoch1(client, server);
        const records: Uint8Array[] = [];
        for (let i = 0; i < 5; i++) {
            records.push(
                DtlsRecord.encode(
                    {
                        type: ContentType.APPLICATION_DATA,
                        epoch: 1,
                        sequenceNumber: client.nextWriteSeq(),
                        fragment: new Uint8Array([i]),
                    },
                    client,
                ),
            );
        }
        // Deliver in scrambled order: 4, 0, 2, 1, 3
        for (const idx of [4, 0, 2, 1, 3]) {
            const { record } = DtlsRecord.decode(records[idx], server);
            expect(record.fragment[0]).to.equal(idx);
        }
        // Replay any one of them — rejected.
        expect(() => DtlsRecord.decode(records[2], server)).to.throw(DtlsReplayError);
    });
});
