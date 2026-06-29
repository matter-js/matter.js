/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { ServerHelloMessage } from "../src/dtls/handshake/ServerHelloMessage.js";

interface BuildArgs {
    versionMajor?: number;
    versionMinor?: number;
    serverRandom: Uint8Array;
    sessionId?: Uint8Array;
    cipherSuite?: number;
    compression?: number;
    extensions?: Array<{ type: number; data: Uint8Array }>;
    omitExtensionsBlock?: boolean;
}

function buildServerHelloBody(args: BuildArgs): Uint8Array {
    const major = args.versionMajor ?? 0xfe;
    const minor = args.versionMinor ?? 0xfd;
    const session = args.sessionId ?? new Uint8Array(0);
    const suite = args.cipherSuite ?? 0xc0ff;
    const compression = args.compression ?? 0x00;
    const extensions = args.extensions ?? [];
    const extEntriesLen = extensions.reduce((acc, e) => acc + 2 + 2 + e.data.length, 0);
    const baseLen = 2 + 32 + 1 + session.length + 2 + 1;
    const totalLen = args.omitExtensionsBlock ? baseLen : baseLen + 2 + extEntriesLen;
    const out = new Uint8Array(totalLen);
    let p = 0;
    out[p++] = major;
    out[p++] = minor;
    out.set(args.serverRandom, p);
    p += 32;
    out[p++] = session.length;
    out.set(session, p);
    p += session.length;
    out[p++] = (suite >>> 8) & 0xff;
    out[p++] = suite & 0xff;
    out[p++] = compression;
    if (!args.omitExtensionsBlock) {
        out[p++] = (extEntriesLen >>> 8) & 0xff;
        out[p++] = extEntriesLen & 0xff;
        for (const ext of extensions) {
            out[p++] = (ext.type >>> 8) & 0xff;
            out[p++] = ext.type & 0xff;
            out[p++] = (ext.data.length >>> 8) & 0xff;
            out[p++] = ext.data.length & 0xff;
            out.set(ext.data, p);
            p += ext.data.length;
        }
    }
    return out;
}

describe("ServerHelloMessage.parse", () => {
    const random = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        random[i] = i + 1;
    }

    it("extracts server_random + ecjpake_kkpp payload from a typical ServerHello", () => {
        const ecjpakeKkpp = Bytes.of(Bytes.fromHex("00112233445566778899"));
        const body = buildServerHelloBody({
            serverRandom: random,
            extensions: [{ type: 0x0100, data: ecjpakeKkpp }],
        });
        const parsed = ServerHelloMessage.parse(body);
        expect(Bytes.areEqual(parsed.serverRandom, random)).to.equal(true);
        expect(Bytes.areEqual(parsed.ecjpakeKkpp, ecjpakeKkpp)).to.equal(true);
    });

    it("returns a copied serverRandom (mutating the input does not corrupt it)", () => {
        const body = buildServerHelloBody({
            serverRandom: random,
            extensions: [{ type: 0x0100, data: new Uint8Array(0) }],
        });
        const parsed = ServerHelloMessage.parse(body);
        body[2] = 0xee;
        expect(parsed.serverRandom[0]).to.equal(1);
    });

    it("tolerates and skips unknown extensions while still extracting ecjpake_kkpp", () => {
        const ecjpakeKkpp = Bytes.of(Bytes.fromHex("aabbcc"));
        const body = buildServerHelloBody({
            serverRandom: random,
            extensions: [
                { type: 0xff01, data: Bytes.of(Bytes.fromHex("deadbeef")) },
                { type: 0x0100, data: ecjpakeKkpp },
                { type: 0x0010, data: Bytes.of(Bytes.fromHex("0102")) },
            ],
        });
        const parsed = ServerHelloMessage.parse(body);
        expect(Bytes.areEqual(parsed.ecjpakeKkpp, ecjpakeKkpp)).to.equal(true);
    });

    it("rejects non-DTLS 1.2 versions", () => {
        const body = buildServerHelloBody({
            versionMajor: 0xfe,
            versionMinor: 0xff,
            serverRandom: random,
            extensions: [{ type: 0x0100, data: new Uint8Array(0) }],
        });
        expect(() => ServerHelloMessage.parse(body)).to.throw(/DTLS 1.2/);
    });

    it("rejects an unsupported cipher suite", () => {
        const body = buildServerHelloBody({
            serverRandom: random,
            cipherSuite: 0xc0a8,
            extensions: [{ type: 0x0100, data: new Uint8Array(0) }],
        });
        expect(() => ServerHelloMessage.parse(body)).to.throw(/cipher suite/);
    });

    it("rejects an unsupported compression method", () => {
        const body = buildServerHelloBody({
            serverRandom: random,
            compression: 0x01,
            extensions: [{ type: 0x0100, data: new Uint8Array(0) }],
        });
        expect(() => ServerHelloMessage.parse(body)).to.throw(/compression/);
    });

    it("rejects when ecjpake_kkpp is missing", () => {
        const body = buildServerHelloBody({
            serverRandom: random,
            extensions: [{ type: 0x000d, data: new Uint8Array(0) }],
        });
        expect(() => ServerHelloMessage.parse(body)).to.throw(/ecjpake_kkpp/);
    });

    it("rejects when the extensions block is omitted entirely (no ecjpake_kkpp)", () => {
        const body = buildServerHelloBody({ serverRandom: random, omitExtensionsBlock: true });
        expect(() => ServerHelloMessage.parse(body)).to.throw(/ecjpake_kkpp/);
    });

    it("rejects multiple ecjpake_kkpp extensions", () => {
        const body = buildServerHelloBody({
            serverRandom: random,
            extensions: [
                { type: 0x0100, data: Bytes.of(Bytes.fromHex("aa")) },
                { type: 0x0100, data: Bytes.of(Bytes.fromHex("bb")) },
            ],
        });
        expect(() => ServerHelloMessage.parse(body)).to.throw(/multiple ecjpake_kkpp/);
    });

    it("rejects truncated bodies", () => {
        const body = buildServerHelloBody({
            serverRandom: random,
            extensions: [{ type: 0x0100, data: new Uint8Array(0) }],
        });
        expect(() => ServerHelloMessage.parse(body.subarray(0, body.length - 1))).to.throw();
    });

    it("rejects extension data overrunning the extensions block", () => {
        // Build a malformed body: claim extension data length 100 but only 0 bytes follow.
        const body = buildServerHelloBody({
            serverRandom: random,
            extensions: [{ type: 0x0100, data: new Uint8Array(0) }],
        });
        // The ecjpake_kkpp extension lives at: 2(version) + 32(random) + 1(sid_len)
        //   + 2(suite) + 1(compression) + 2(exts_len) + 2(ext_type) = 42, then ext_data_len at 42.
        const tampered = Uint8Array.from(body);
        tampered[42] = 0xff;
        tampered[43] = 0xff;
        expect(() => ServerHelloMessage.parse(tampered)).to.throw(/overrun/);
    });
});
