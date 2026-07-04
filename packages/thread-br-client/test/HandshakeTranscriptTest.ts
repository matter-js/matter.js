/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, StandardCrypto } from "@matter/general";
import { HandshakeTranscript } from "../src/dtls/prf/HandshakeTranscript.js";

const crypto = new StandardCrypto();

async function sha256(...parts: Uint8Array[]): Promise<Uint8Array> {
    return Bytes.of(await crypto.computeHash(parts));
}

describe("HandshakeTranscript", () => {
    it("digest of an empty transcript equals SHA-256 of the empty string", async () => {
        const t = new HandshakeTranscript(crypto);
        expect(Bytes.toHex(await t.digest())).to.equal(Bytes.toHex(await sha256(new Uint8Array())));
    });

    it("digest after one append equals SHA-256(message)", async () => {
        const t = new HandshakeTranscript(crypto);
        const msg = Bytes.of(Bytes.fromHex("01000004deadbeef"));
        t.appendHandshakeMessage(msg);
        expect(Bytes.toHex(await t.digest())).to.equal(Bytes.toHex(await sha256(msg)));
    });

    it("digest after multiple appends equals SHA-256(concat(...messages))", async () => {
        const t = new HandshakeTranscript(crypto);
        const m1 = Bytes.of(Bytes.fromHex("0100000401020304"));
        const m2 = Bytes.of(Bytes.fromHex("0200000405060708"));
        const m3 = Bytes.of(Bytes.fromHex("0b00000409aa55"));
        t.appendHandshakeMessage(m1);
        t.appendHandshakeMessage(m2);
        t.appendHandshakeMessage(m3);
        expect(Bytes.toHex(await t.digest())).to.equal(Bytes.toHex(await sha256(m1, m2, m3)));
    });

    it("digest() does not mutate the running hash — repeated calls return the same value", async () => {
        const t = new HandshakeTranscript(crypto);
        t.appendHandshakeMessage(Bytes.of(Bytes.fromHex("01000003aabbcc")));
        const first = await t.digest();
        const second = await t.digest();
        const third = await t.digest();
        expect(Bytes.areEqual(first, second)).to.equal(true);
        expect(Bytes.areEqual(second, third)).to.equal(true);
    });

    it("digest() is non-mutating: appending after a snapshot continues from the same state", async () => {
        const t = new HandshakeTranscript(crypto);
        const m1 = Bytes.of(Bytes.fromHex("01000002aabb"));
        const m2 = Bytes.of(Bytes.fromHex("02000002ccdd"));
        t.appendHandshakeMessage(m1);
        const snapshot = await t.digest();
        t.appendHandshakeMessage(m2);
        const after = await t.digest();
        expect(Bytes.toHex(snapshot)).to.equal(Bytes.toHex(await sha256(m1)));
        expect(Bytes.toHex(after)).to.equal(Bytes.toHex(await sha256(m1, m2)));
    });

    it("digest length is always 32 bytes", async () => {
        const t = new HandshakeTranscript(crypto);
        expect((await t.digest()).length).to.equal(32);
        t.appendHandshakeMessage(new Uint8Array(1024));
        expect((await t.digest()).length).to.equal(32);
    });

    it("appending an empty message is a no-op for the digest", async () => {
        const t = new HandshakeTranscript(crypto);
        const m = Bytes.of(Bytes.fromHex("01000003aabbcc"));
        t.appendHandshakeMessage(m);
        const before = await t.digest();
        t.appendHandshakeMessage(new Uint8Array());
        expect(Bytes.toHex(await t.digest())).to.equal(Bytes.toHex(before));
    });
});
