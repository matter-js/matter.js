/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { DTLS_HANDSHAKE_HEADER_LEN, HandshakeMessage } from "../src/dtls/handshake/HandshakeMessage.js";
import { HandshakeType, isHandshakeType } from "../src/dtls/handshake/HandshakeType.js";

describe("HandshakeType.isHandshakeType", () => {
    it("accepts every documented value", () => {
        for (const value of [0, 1, 2, 3, 11, 12, 14, 16, 20]) {
            expect(isHandshakeType(value)).to.equal(true);
        }
    });

    it("rejects bytes outside the documented set", () => {
        for (const value of [4, 10, 13, 15, 17, 21, 100, 255]) {
            expect(isHandshakeType(value)).to.equal(false);
        }
    });
});

describe("HandshakeMessage envelope", () => {
    it("encodes an unfragmented ClientHello with offset=0 and frag_len=length", () => {
        const body = Bytes.of(Bytes.fromHex("aabbccdd"));
        const wire = HandshakeMessage.encode({
            msgType: HandshakeType.CLIENT_HELLO,
            messageSeq: 0,
            body,
        });
        expect(wire.length).to.equal(DTLS_HANDSHAKE_HEADER_LEN + body.length);
        expect(wire[0]).to.equal(HandshakeType.CLIENT_HELLO);
        // length (3 BE) = 4
        expect(wire[1]).to.equal(0);
        expect(wire[2]).to.equal(0);
        expect(wire[3]).to.equal(4);
        // message_seq = 0
        expect(wire[4]).to.equal(0);
        expect(wire[5]).to.equal(0);
        // fragment_offset = 0
        expect(wire[6]).to.equal(0);
        expect(wire[7]).to.equal(0);
        expect(wire[8]).to.equal(0);
        // fragment_length = 4
        expect(wire[9]).to.equal(0);
        expect(wire[10]).to.equal(0);
        expect(wire[11]).to.equal(4);
        expect(Bytes.areEqual(wire.subarray(DTLS_HANDSHAKE_HEADER_LEN), body)).to.equal(true);
    });

    it("round-trips through encode/decode preserving msg_type, message_seq and body", () => {
        const body = Bytes.of(Bytes.fromHex("000102030405060708"));
        const wire = HandshakeMessage.encode({
            msgType: HandshakeType.SERVER_HELLO,
            messageSeq: 0x1234,
            body,
        });
        const { message, consumed } = HandshakeMessage.decode(wire);
        expect(consumed).to.equal(wire.length);
        expect(message.msgType).to.equal(HandshakeType.SERVER_HELLO);
        expect(message.messageSeq).to.equal(0x1234);
        expect(Bytes.areEqual(message.body, body)).to.equal(true);
    });

    it("decode reports `consumed` so multiple messages can be split off the same buffer", () => {
        const a = HandshakeMessage.encode({
            msgType: HandshakeType.SERVER_HELLO,
            messageSeq: 1,
            body: Bytes.of(Bytes.fromHex("aa")),
        });
        const b = HandshakeMessage.encode({
            msgType: HandshakeType.SERVER_KEY_EXCHANGE,
            messageSeq: 2,
            body: Bytes.of(Bytes.fromHex("bbcc")),
        });
        const concat = new Uint8Array(a.length + b.length);
        concat.set(a, 0);
        concat.set(b, a.length);
        const first = HandshakeMessage.decode(concat);
        expect(first.consumed).to.equal(a.length);
        expect(first.message.msgType).to.equal(HandshakeType.SERVER_HELLO);
        const second = HandshakeMessage.decode(concat.subarray(first.consumed));
        expect(second.consumed).to.equal(b.length);
        expect(second.message.msgType).to.equal(HandshakeType.SERVER_KEY_EXCHANGE);
        expect(Bytes.toHex(second.message.body)).to.equal("bbcc");
    });

    it("rejects fragmented input (fragment_offset != 0 or fragment_length != length)", () => {
        const wire = HandshakeMessage.encode({
            msgType: HandshakeType.CLIENT_HELLO,
            messageSeq: 0,
            body: Bytes.of(Bytes.fromHex("00112233")),
        });
        // Tamper fragment_length down to 2 — claim a partial fragment.
        const tampered = Uint8Array.from(wire);
        tampered[11] = 2;
        expect(() => HandshakeMessage.decode(tampered)).to.throw(/fragmented/);
        const offsetTampered = Uint8Array.from(wire);
        offsetTampered[8] = 1;
        expect(() => HandshakeMessage.decode(offsetTampered)).to.throw(/fragmented/);
    });

    it("rejects truncated headers and bodies", () => {
        const wire = HandshakeMessage.encode({
            msgType: HandshakeType.CLIENT_HELLO,
            messageSeq: 0,
            body: Bytes.of(Bytes.fromHex("00112233")),
        });
        expect(() => HandshakeMessage.decode(wire.subarray(0, DTLS_HANDSHAKE_HEADER_LEN - 1))).to.throw(
            /header truncated/,
        );
        expect(() => HandshakeMessage.decode(wire.subarray(0, wire.length - 1))).to.throw(/body truncated/);
    });

    it("rejects unknown msg_type bytes", () => {
        const buf = new Uint8Array(DTLS_HANDSHAKE_HEADER_LEN);
        buf[0] = 99;
        expect(() => HandshakeMessage.decode(buf)).to.throw(/unknown msg_type/);
        expect(() =>
            HandshakeMessage.encode({
                msgType: 99 as HandshakeType,
                messageSeq: 0,
                body: new Uint8Array(0),
            }),
        ).to.throw(/unknown msg_type/);
    });

    it("rejects message_seq outside the 16-bit range", () => {
        expect(() =>
            HandshakeMessage.encode({
                msgType: HandshakeType.CLIENT_HELLO,
                messageSeq: -1,
                body: new Uint8Array(0),
            }),
        ).to.throw(/message_seq/);
        expect(() =>
            HandshakeMessage.encode({
                msgType: HandshakeType.CLIENT_HELLO,
                messageSeq: 0x10000,
                body: new Uint8Array(0),
            }),
        ).to.throw(/message_seq/);
    });

    it("encodeForTranscript produces the full DTLS 1.2 12-byte header form (matches encode)", () => {
        const body = Bytes.of(Bytes.fromHex("deadbeef"));
        const transcriptBytes = HandshakeMessage.encodeForTranscript({
            msgType: HandshakeType.CLIENT_HELLO,
            messageSeq: 0,
            body,
        });
        expect(transcriptBytes.length).to.equal(DTLS_HANDSHAKE_HEADER_LEN + body.length);
        expect(transcriptBytes[0]).to.equal(HandshakeType.CLIENT_HELLO);
        // length (3 BE) = 4
        expect(transcriptBytes[1]).to.equal(0);
        expect(transcriptBytes[2]).to.equal(0);
        expect(transcriptBytes[3]).to.equal(4);
        // message_seq = 0
        expect(transcriptBytes[4]).to.equal(0);
        expect(transcriptBytes[5]).to.equal(0);
        // fragment_offset = 0
        expect(transcriptBytes[6]).to.equal(0);
        expect(transcriptBytes[7]).to.equal(0);
        expect(transcriptBytes[8]).to.equal(0);
        // fragment_length = 4
        expect(transcriptBytes[9]).to.equal(0);
        expect(transcriptBytes[10]).to.equal(0);
        expect(transcriptBytes[11]).to.equal(4);
        expect(Bytes.areEqual(transcriptBytes.subarray(DTLS_HANDSHAKE_HEADER_LEN), body)).to.equal(true);
        // Identical to encode()
        const wire = HandshakeMessage.encode({
            msgType: HandshakeType.CLIENT_HELLO,
            messageSeq: 0,
            body,
        });
        expect(Bytes.areEqual(transcriptBytes, wire)).to.equal(true);
    });

    it("encodeForTranscript reflects message_seq — different seqs produce different bytes", () => {
        const body = Bytes.of(Bytes.fromHex("0102"));
        const t1 = HandshakeMessage.encodeForTranscript({ msgType: HandshakeType.SERVER_HELLO, messageSeq: 7, body });
        const t2 = HandshakeMessage.encodeForTranscript({ msgType: HandshakeType.SERVER_HELLO, messageSeq: 7, body });
        expect(Bytes.areEqual(t1, t2)).to.equal(true);
        const t3 = HandshakeMessage.encodeForTranscript({ msgType: HandshakeType.SERVER_HELLO, messageSeq: 8, body });
        expect(Bytes.areEqual(t1, t3)).to.equal(false);
    });
});
