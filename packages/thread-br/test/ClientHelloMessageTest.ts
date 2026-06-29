/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import {
    CIPHER_SUITE_ECJPAKE_WITH_AES_128_CCM_8,
    ClientHelloMessage,
    EXTENSION_TYPE_EC_POINT_FORMATS,
    EXTENSION_TYPE_ECJPAKE_KKPP,
    EXTENSION_TYPE_SUPPORTED_GROUPS,
    NAMED_CURVE_SECP256R1,
} from "../src/dtls/handshake/ClientHelloMessage.js";

function fillRange(start: number, count: number): Uint8Array {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
        out[i] = (start + i) & 0xff;
    }
    return out;
}

describe("ClientHelloMessage.build", () => {
    it("emits the expected wire layout for an empty cookie + minimal extension", () => {
        const random = fillRange(0, 32);
        const cookie = new Uint8Array(0);
        const ecjpakeKkpp = Bytes.of(Bytes.fromHex("aabb"));
        const body = ClientHelloMessage.build({ random, cookie, ecjpakeKkpp });

        let p = 0;
        // version DTLS 1.2
        expect(body[p++]).to.equal(0xfe);
        expect(body[p++]).to.equal(0xfd);
        // random
        expect(Bytes.areEqual(body.subarray(p, p + 32), random)).to.equal(true);
        p += 32;
        // session_id len = 0
        expect(body[p++]).to.equal(0);
        // cookie len = 0
        expect(body[p++]).to.equal(0);
        // cipher_suites length(2) = 2
        expect(body[p++]).to.equal(0);
        expect(body[p++]).to.equal(2);
        expect(body[p++]).to.equal(0xc0);
        expect(body[p++]).to.equal(0xff);
        // compression length=1, body=0x00
        expect(body[p++]).to.equal(1);
        expect(body[p++]).to.equal(0x00);
        // extensions length:
        //   ecjpake_kkpp(0x0100) = 4 header + 2 payload = 6
        //   supported_groups(0x000a) = 4 header + 2 list_len + 2 secp256r1 = 8
        //   ec_point_formats(0x000b) = 4 header + 1 list_len + 1 uncompressed = 6
        //   total = 20
        expect(body[p++]).to.equal(0);
        expect(body[p++]).to.equal(20);
        // ecjpake_kkpp: type 0x0100, len 2, payload aa bb
        expect(body[p++]).to.equal(0x01);
        expect(body[p++]).to.equal(0x00);
        expect(body[p++]).to.equal(0);
        expect(body[p++]).to.equal(2);
        expect(body[p++]).to.equal(0xaa);
        expect(body[p++]).to.equal(0xbb);
        // supported_groups: type 0x000a, ext_data_len 4, list_len 2, secp256r1 0x0017
        expect(body[p++]).to.equal(0x00);
        expect(body[p++]).to.equal(0x0a);
        expect(body[p++]).to.equal(0);
        expect(body[p++]).to.equal(4);
        expect(body[p++]).to.equal(0);
        expect(body[p++]).to.equal(2);
        expect(body[p++]).to.equal(0x00);
        expect(body[p++]).to.equal(0x17);
        // ec_point_formats: type 0x000b, ext_data_len 2, list_len 1, uncompressed 0x00
        expect(body[p++]).to.equal(0x00);
        expect(body[p++]).to.equal(0x0b);
        expect(body[p++]).to.equal(0);
        expect(body[p++]).to.equal(2);
        expect(body[p++]).to.equal(1);
        expect(body[p++]).to.equal(0x00);
        expect(p).to.equal(body.length);
    });

    it("encodes the cookie in the DTLS-only field with a 1-byte length prefix", () => {
        const random = new Uint8Array(32).fill(0x11);
        const cookie = Bytes.of(Bytes.fromHex("0102030405060708"));
        const ecjpakeKkpp = new Uint8Array(0);
        const body = ClientHelloMessage.build({ random, cookie, ecjpakeKkpp });
        // version(2) + random(32) + session_id_len(1) = 35
        expect(body[35]).to.equal(cookie.length);
        expect(Bytes.areEqual(body.subarray(36, 36 + cookie.length), cookie)).to.equal(true);
    });

    it("uses cipher suite 0xC0FF and compression 0x00 (the only ones we support)", () => {
        const body = ClientHelloMessage.build({
            random: new Uint8Array(32),
            cookie: new Uint8Array(0),
            ecjpakeKkpp: new Uint8Array(0),
        });
        // After version(2) + random(32) + session_id_len(1)+0 + cookie_len(1)+0
        // = 36 bytes, we have cipher_suites length(2) + suite(2) + compression(1)+0x00.
        const offset = 36;
        // cipher_suites length
        expect((body[offset] << 8) | body[offset + 1]).to.equal(2);
        const suite = (body[offset + 2] << 8) | body[offset + 3];
        expect(suite).to.equal(CIPHER_SUITE_ECJPAKE_WITH_AES_128_CCM_8);
        // compression length + null
        expect(body[offset + 4]).to.equal(1);
        expect(body[offset + 5]).to.equal(0x00);
    });

    it("places the ecjpake_kkpp extension type as 0x0100 with a 2-byte data length prefix", () => {
        const ecjpakeKkpp = fillRange(0x40, 200);
        const body = ClientHelloMessage.build({
            random: new Uint8Array(32),
            cookie: new Uint8Array(0),
            ecjpakeKkpp,
        });
        // Locate extensions block at: body length - (block payload + 2 length prefix)
        // ecjpake_kkpp = 4 + 200 = 204; supported_groups = 8; ec_point_formats = 6
        const ecjpakeEntryLen = 4 + 200;
        const supportedGroupsLen = 8;
        const ecPointFormatsLen = 6;
        const extEntriesLen = ecjpakeEntryLen + supportedGroupsLen + ecPointFormatsLen;
        const extBlockLen = 2 + extEntriesLen;
        const start = body.length - extBlockLen;
        // extensions list length
        expect((body[start] << 8) | body[start + 1]).to.equal(extEntriesLen);
        // ecjpake_kkpp comes first
        expect((body[start + 2] << 8) | body[start + 3]).to.equal(EXTENSION_TYPE_ECJPAKE_KKPP);
        expect((body[start + 4] << 8) | body[start + 5]).to.equal(200);
        expect(Bytes.areEqual(body.subarray(start + 6, start + 6 + 200), ecjpakeKkpp)).to.equal(true);
        // supported_groups follows
        const sgStart = start + 2 + ecjpakeEntryLen;
        expect((body[sgStart] << 8) | body[sgStart + 1]).to.equal(EXTENSION_TYPE_SUPPORTED_GROUPS);
        expect((body[sgStart + 2] << 8) | body[sgStart + 3]).to.equal(4);
        expect((body[sgStart + 4] << 8) | body[sgStart + 5]).to.equal(2);
        expect((body[sgStart + 6] << 8) | body[sgStart + 7]).to.equal(NAMED_CURVE_SECP256R1);
        // ec_point_formats last
        const epfStart = sgStart + supportedGroupsLen;
        expect((body[epfStart] << 8) | body[epfStart + 1]).to.equal(EXTENSION_TYPE_EC_POINT_FORMATS);
        expect((body[epfStart + 2] << 8) | body[epfStart + 3]).to.equal(2);
        expect(body[epfStart + 4]).to.equal(1);
        expect(body[epfStart + 5]).to.equal(0x00);
    });

    it("rejects a random other than 32 bytes", () => {
        expect(() =>
            ClientHelloMessage.build({
                random: new Uint8Array(31),
                cookie: new Uint8Array(0),
                ecjpakeKkpp: new Uint8Array(0),
            }),
        ).to.throw(/random/);
        expect(() =>
            ClientHelloMessage.build({
                random: new Uint8Array(33),
                cookie: new Uint8Array(0),
                ecjpakeKkpp: new Uint8Array(0),
            }),
        ).to.throw(/random/);
    });

    it("rejects a cookie longer than 255 bytes (DTLS 1-byte length field)", () => {
        expect(() =>
            ClientHelloMessage.build({
                random: new Uint8Array(32),
                cookie: new Uint8Array(256),
                ecjpakeKkpp: new Uint8Array(0),
            }),
        ).to.throw(/cookie/);
    });
});
