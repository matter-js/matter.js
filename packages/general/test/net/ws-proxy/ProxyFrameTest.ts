/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { decodeProxyFrame, encodeProxyFrame, ProxyFrameError } from "#net/ws-proxy/ProxyFrame.js";

describe("ProxyFrame", () => {
    describe("encodeProxyFrame / decodeProxyFrame", () => {
        it("should encode and decode an opcode 1 frame", () => {
            const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
            const encoded = encodeProxyFrame(0x01, 1, payload);

            expect(encoded.length).to.equal(7);
            expect(encoded[0]).to.equal(0x01);
            expect(encoded[1]).to.equal(0x00);
            expect(encoded[2]).to.equal(0x01);

            const decoded = decodeProxyFrame(encoded);
            expect(decoded.opcode).to.equal(0x01);
            expect(decoded.handle).to.equal(1);
            expect(decoded.payload).to.deep.equal(payload);
        });

        it("should encode and decode an opcode 2 frame", () => {
            const payload = new Uint8Array([0x65, 0x6c, 0x04, 0xf4, 0x00, 0x06]);
            const encoded = encodeProxyFrame(0x02, 42, payload);
            const decoded = decodeProxyFrame(encoded);

            expect(decoded.opcode).to.equal(0x02);
            expect(decoded.handle).to.equal(42);
            expect(decoded.payload).to.deep.equal(payload);
        });

        it("should encode and decode an opcode 3 frame", () => {
            const payload = new Uint8Array([0xaa, 0xbb]);
            const encoded = encodeProxyFrame(0x03, 100, payload);
            const decoded = decodeProxyFrame(encoded);

            expect(decoded.opcode).to.equal(0x03);
            expect(decoded.handle).to.equal(100);
            expect(decoded.payload).to.deep.equal(payload);
        });

        it("should handle empty payload", () => {
            const payload = new Uint8Array(0);
            const encoded = encodeProxyFrame(0x01, 1, payload);

            expect(encoded.length).to.equal(3);

            const decoded = decodeProxyFrame(encoded);
            expect(decoded.opcode).to.equal(0x01);
            expect(decoded.handle).to.equal(1);
            expect(decoded.payload.length).to.equal(0);
        });

        it("should handle max handle (0xFFFF)", () => {
            const payload = new Uint8Array([0x01]);
            const encoded = encodeProxyFrame(0x02, 0xffff, payload);

            expect(encoded[1]).to.equal(0xff);
            expect(encoded[2]).to.equal(0xff);

            const decoded = decodeProxyFrame(encoded);
            expect(decoded.handle).to.equal(0xffff);
        });

        it("should handle handle 0", () => {
            const payload = new Uint8Array([0x01]);
            const encoded = encodeProxyFrame(0x01, 0, payload);

            expect(encoded[1]).to.equal(0x00);
            expect(encoded[2]).to.equal(0x00);

            const decoded = decodeProxyFrame(encoded);
            expect(decoded.handle).to.equal(0);
        });

        it("should throw on frame too short", () => {
            expect(() => decodeProxyFrame(new Uint8Array(2))).to.throw(ProxyFrameError, "Binary frame too short");
            expect(() => decodeProxyFrame(new Uint8Array(1))).to.throw(ProxyFrameError, "Binary frame too short");
            expect(() => decodeProxyFrame(new Uint8Array(0))).to.throw(ProxyFrameError, "Binary frame too short");
        });

        it("should handle large payload", () => {
            const payload = new Uint8Array(1024);
            payload.fill(0x42);
            const encoded = encodeProxyFrame(0x01, 5, payload);
            const decoded = decodeProxyFrame(encoded);

            expect(decoded.payload.length).to.equal(1024);
            expect(decoded.payload[0]).to.equal(0x42);
            expect(decoded.payload[1023]).to.equal(0x42);
        });

        it("should preserve big-endian handle encoding", () => {
            const encoded = encodeProxyFrame(0x01, 0x0102, new Uint8Array(0));
            expect(encoded[1]).to.equal(0x01);
            expect(encoded[2]).to.equal(0x02);
        });

        it("should decode a hand-written wire buffer as big-endian", () => {
            const decoded = decodeProxyFrame(new Uint8Array([0x02, 0x01, 0x02, 0xaa]));

            expect(decoded.opcode).to.equal(0x02);
            expect(decoded.handle).to.equal(0x0102);
            expect(Array.from(decoded.payload)).to.deep.equal([0xaa]);
        });
    });
});
