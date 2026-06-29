/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { HelloVerifyRequestMessage } from "../src/dtls/handshake/HelloVerifyRequestMessage.js";

describe("HelloVerifyRequestMessage.parse", () => {
    it("extracts an empty cookie", () => {
        const body = Bytes.of(Bytes.fromHex("fefd00"));
        const result = HelloVerifyRequestMessage.parse(body);
        expect(result.cookie.length).to.equal(0);
    });

    it("extracts a typical 16-byte cookie", () => {
        const cookieHex = "00112233445566778899aabbccddeeff";
        const body = Bytes.of(Bytes.fromHex("fefd10" + cookieHex));
        const result = HelloVerifyRequestMessage.parse(body);
        expect(Bytes.toHex(result.cookie)).to.equal(cookieHex);
    });

    it("extracts a maximum-length 255-byte cookie", () => {
        const cookie = new Uint8Array(255);
        for (let i = 0; i < 255; i++) {
            cookie[i] = (i * 7) & 0xff;
        }
        const header = Bytes.of(Bytes.fromHex("fefdff"));
        const body = new Uint8Array(header.length + cookie.length);
        body.set(header, 0);
        body.set(cookie, header.length);
        const result = HelloVerifyRequestMessage.parse(body);
        expect(Bytes.areEqual(result.cookie, cookie)).to.equal(true);
    });

    it("returns a copy of the cookie that does not alias the input buffer", () => {
        const body = Bytes.of(Bytes.fromHex("fefd04aabbccdd"));
        const result = HelloVerifyRequestMessage.parse(body);
        // Mutate the source buffer; the cookie copy must not change.
        body[3] = 0x00;
        expect(result.cookie[0]).to.equal(0xaa);
    });

    it("rejects bodies shorter than the 3-byte minimum (version + length)", () => {
        expect(() => HelloVerifyRequestMessage.parse(new Uint8Array(0))).to.throw(/truncated/);
        expect(() => HelloVerifyRequestMessage.parse(new Uint8Array(2))).to.throw(/truncated/);
    });

    it("rejects body length disagreeing with the cookie length field", () => {
        // length byte says 2 but only 1 cookie byte present
        const body = Bytes.of(Bytes.fromHex("fefd02aa"));
        expect(() => HelloVerifyRequestMessage.parse(body)).to.throw(/length/);
        // length byte says 0 but 1 trailing byte present
        const trailing = Bytes.of(Bytes.fromHex("fefd0099"));
        expect(() => HelloVerifyRequestMessage.parse(trailing)).to.throw(/length/);
    });
});
