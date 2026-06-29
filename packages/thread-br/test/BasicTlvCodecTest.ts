/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { BasicTlv } from "../src/tlv/BasicTlvCodec.js";

describe("BasicTlv", () => {
    describe("walk", () => {
        it("walks two short TLVs", () => {
            const blob = Bytes.of(Bytes.fromHex("0001ff0203aabbcc"));
            const entries = BasicTlv.walk(blob);
            expect(entries).to.have.lengthOf(2);
            expect(entries[0].type).to.equal(0x00);
            expect(entries[0].value).to.deep.equal(Bytes.of(Bytes.fromHex("ff")));
            expect(entries[1].type).to.equal(0x02);
            expect(entries[1].value).to.deep.equal(Bytes.of(Bytes.fromHex("aabbcc")));
        });

        it("returns an empty array for empty input", () => {
            expect(BasicTlv.walk(new Uint8Array())).to.deep.equal([]);
        });

        it("throws on a truncated TLV", () => {
            expect(() => BasicTlv.walk(Bytes.of(Bytes.fromHex("0005aabb")))).to.throw(/truncated/i);
        });

        it("throws on a header-only truncation", () => {
            expect(() => BasicTlv.walk(new Uint8Array([0x00]))).to.throw(/truncated/i);
        });

        it("decodes a TLV using the 0xFF extended-length escape", () => {
            const value = new Uint8Array(300);
            for (let i = 0; i < value.length; i++) value[i] = i & 0xff;
            const blob = new Uint8Array(1 + 1 + 2 + value.length);
            blob[0] = 0x05;
            blob[1] = 0xff;
            blob[2] = (value.length >> 8) & 0xff;
            blob[3] = value.length & 0xff;
            blob.set(value, 4);

            const entries = BasicTlv.walk(blob);
            expect(entries).to.have.lengthOf(1);
            expect(entries[0].type).to.equal(0x05);
            expect(entries[0].value).to.deep.equal(value);
        });

        it("throws on a truncated extended-length header", () => {
            expect(() => BasicTlv.walk(new Uint8Array([0x05, 0xff, 0x01]))).to.throw(/truncated/i);
        });
    });

    describe("encode", () => {
        it("emits the basic length form for values <255 bytes", () => {
            const entries = [
                { type: 0x00, value: new Uint8Array([0xff]) },
                { type: 0x02, value: new Uint8Array([0xaa, 0xbb, 0xcc]) },
            ];
            expect(BasicTlv.encode(entries)).to.deep.equal(Bytes.of(Bytes.fromHex("0001ff0203aabbcc")));
        });

        it("emits the 0xFF extended-length escape for values >=255 bytes", () => {
            const value = new Uint8Array(255);
            const encoded = BasicTlv.encode([{ type: 0x05, value }]);
            expect(encoded.length).to.equal(1 + 1 + 2 + 255);
            expect(encoded[0]).to.equal(0x05);
            expect(encoded[1]).to.equal(0xff);
            expect(encoded[2]).to.equal(0x00);
            expect(encoded[3]).to.equal(0xff);
        });

        it("round-trips arbitrary entries", () => {
            const long = new Uint8Array(512);
            for (let i = 0; i < long.length; i++) long[i] = (i * 7) & 0xff;
            const entries = [
                { type: 0x00, value: new Uint8Array([0x0f]) },
                { type: 0x02, value: new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]) },
                { type: 0x05, value: long },
                { type: 0xfe, value: new Uint8Array() },
            ];
            const encoded = BasicTlv.encode(entries);
            const walked = BasicTlv.walk(encoded);
            expect(walked).to.deep.equal(entries);
        });

        it("rejects a value larger than 0xFFFF bytes", () => {
            const tooLong = new Uint8Array(0x10000);
            expect(() => BasicTlv.encode([{ type: 0x05, value: tooLong }])).to.throw(/length/i);
        });

        it("rejects a TLV type outside 0..255", () => {
            expect(() => BasicTlv.encode([{ type: 0x100, value: new Uint8Array() }])).to.throw(/type/i);
        });
    });
});
