/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    BinaryFrameOpcode,
    BLE_PROXY_PROTOCOL_VERSION,
    decodeBinaryFrame,
    encodeBinaryFrame,
} from "../src/BleProxyProtocol.js";

describe("BleProxyProtocol", () => {
    describe("protocol version", () => {
        it("should be 1", () => {
            expect(BLE_PROXY_PROTOCOL_VERSION).to.equal(1);
        });
    });

    describe("encodeBinaryFrame / decodeBinaryFrame", () => {
        it("should encode and decode a WRITE_DATA frame", () => {
            const payload = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
            const encoded = encodeBinaryFrame(BinaryFrameOpcode.WriteData, 1, payload);

            expect(encoded.length).to.equal(7); // 3 header + 4 payload
            expect(encoded[0]).to.equal(0x01); // opcode
            expect(encoded[1]).to.equal(0x00); // connection_handle high
            expect(encoded[2]).to.equal(0x01); // connection_handle low

            const decoded = decodeBinaryFrame(encoded);
            expect(decoded.opcode).to.equal(BinaryFrameOpcode.WriteData);
            expect(decoded.handle).to.equal(1);
            expect(decoded.payload).to.deep.equal(payload);
        });

        it("should encode and decode a NOTIFICATION frame", () => {
            const payload = new Uint8Array([0x65, 0x6c, 0x04, 0xf4, 0x00, 0x06]);
            const encoded = encodeBinaryFrame(BinaryFrameOpcode.Notification, 42, payload);
            const decoded = decodeBinaryFrame(encoded);

            expect(decoded.opcode).to.equal(BinaryFrameOpcode.Notification);
            expect(decoded.handle).to.equal(42);
            expect(decoded.payload).to.deep.equal(payload);
        });

        it("should encode and decode a READ_RESPONSE frame", () => {
            const payload = new Uint8Array([0xaa, 0xbb]);
            const encoded = encodeBinaryFrame(BinaryFrameOpcode.ReadResponse, 100, payload);
            const decoded = decodeBinaryFrame(encoded);

            expect(decoded.opcode).to.equal(BinaryFrameOpcode.ReadResponse);
            expect(decoded.handle).to.equal(100);
            expect(decoded.payload).to.deep.equal(payload);
        });

        it("should handle empty payload", () => {
            const payload = new Uint8Array(0);
            const encoded = encodeBinaryFrame(BinaryFrameOpcode.WriteData, 1, payload);

            expect(encoded.length).to.equal(3); // header only

            const decoded = decodeBinaryFrame(encoded);
            expect(decoded.opcode).to.equal(BinaryFrameOpcode.WriteData);
            expect(decoded.handle).to.equal(1);
            expect(decoded.payload.length).to.equal(0);
        });

        it("should handle max connection handle (0xFFFF)", () => {
            const payload = new Uint8Array([0x01]);
            const encoded = encodeBinaryFrame(BinaryFrameOpcode.Notification, 0xffff, payload);

            expect(encoded[1]).to.equal(0xff);
            expect(encoded[2]).to.equal(0xff);

            const decoded = decodeBinaryFrame(encoded);
            expect(decoded.handle).to.equal(0xffff);
        });

        it("should handle connection handle 0", () => {
            const payload = new Uint8Array([0x01]);
            const encoded = encodeBinaryFrame(BinaryFrameOpcode.WriteData, 0, payload);

            expect(encoded[1]).to.equal(0x00);
            expect(encoded[2]).to.equal(0x00);

            const decoded = decodeBinaryFrame(encoded);
            expect(decoded.handle).to.equal(0);
        });

        it("should throw on frame too short", () => {
            expect(() => decodeBinaryFrame(new Uint8Array(2))).to.throw("Binary frame too short");
            expect(() => decodeBinaryFrame(new Uint8Array(1))).to.throw("Binary frame too short");
            expect(() => decodeBinaryFrame(new Uint8Array(0))).to.throw("Binary frame too short");
        });

        it("should handle large payload", () => {
            const payload = new Uint8Array(1024);
            payload.fill(0x42);
            const encoded = encodeBinaryFrame(BinaryFrameOpcode.WriteData, 5, payload);
            const decoded = decodeBinaryFrame(encoded);

            expect(decoded.payload.length).to.equal(1024);
            expect(decoded.payload[0]).to.equal(0x42);
            expect(decoded.payload[1023]).to.equal(0x42);
        });

        it("should preserve big-endian connection handle encoding", () => {
            // Handle 0x0102 should encode as [0x01, 0x02]
            const encoded = encodeBinaryFrame(BinaryFrameOpcode.WriteData, 0x0102, new Uint8Array(0));
            expect(encoded[1]).to.equal(0x01);
            expect(encoded[2]).to.equal(0x02);
        });
    });
});
