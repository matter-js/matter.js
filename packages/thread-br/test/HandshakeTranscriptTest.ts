/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { createHash } from "node:crypto";
import { HandshakeTranscript } from "../src/dtls/prf/HandshakeTranscript.js";

function sha256(...parts: Uint8Array[]): Uint8Array {
    const h = createHash("sha256");
    for (const p of parts) {
        h.update(p);
    }
    return new Uint8Array(h.digest());
}

describe("HandshakeTranscript", () => {
    it("digest of an empty transcript equals SHA-256 of the empty string", () => {
        const t = new HandshakeTranscript();
        expect(Bytes.toHex(t.digest())).to.equal(Bytes.toHex(sha256(new Uint8Array())));
    });

    it("digest after one append equals SHA-256(message)", () => {
        const t = new HandshakeTranscript();
        const msg = Bytes.of(Bytes.fromHex("01000004deadbeef"));
        t.appendHandshakeMessage(msg);
        expect(Bytes.toHex(t.digest())).to.equal(Bytes.toHex(sha256(msg)));
    });

    it("digest after multiple appends equals SHA-256(concat(...messages))", () => {
        const t = new HandshakeTranscript();
        const m1 = Bytes.of(Bytes.fromHex("0100000401020304"));
        const m2 = Bytes.of(Bytes.fromHex("0200000405060708"));
        const m3 = Bytes.of(Bytes.fromHex("0b00000409aa55"));
        t.appendHandshakeMessage(m1);
        t.appendHandshakeMessage(m2);
        t.appendHandshakeMessage(m3);
        expect(Bytes.toHex(t.digest())).to.equal(Bytes.toHex(sha256(m1, m2, m3)));
    });

    it("digest() does not mutate the running hash — repeated calls return the same value", () => {
        const t = new HandshakeTranscript();
        t.appendHandshakeMessage(Bytes.of(Bytes.fromHex("01000003aabbcc")));
        const first = t.digest();
        const second = t.digest();
        const third = t.digest();
        expect(Bytes.areEqual(first, second)).to.equal(true);
        expect(Bytes.areEqual(second, third)).to.equal(true);
    });

    it("digest() is non-mutating: appending after a snapshot continues from the same state", () => {
        const t = new HandshakeTranscript();
        const m1 = Bytes.of(Bytes.fromHex("01000002aabb"));
        const m2 = Bytes.of(Bytes.fromHex("02000002ccdd"));
        t.appendHandshakeMessage(m1);
        const snapshot = t.digest();
        t.appendHandshakeMessage(m2);
        const after = t.digest();
        expect(Bytes.toHex(snapshot)).to.equal(Bytes.toHex(sha256(m1)));
        expect(Bytes.toHex(after)).to.equal(Bytes.toHex(sha256(m1, m2)));
    });

    it("digest length is always 32 bytes", () => {
        const t = new HandshakeTranscript();
        expect(t.digest().length).to.equal(32);
        t.appendHandshakeMessage(new Uint8Array(1024));
        expect(t.digest().length).to.equal(32);
    });

    it("appending an empty message is a no-op for the digest", () => {
        const t = new HandshakeTranscript();
        const m = Bytes.of(Bytes.fromHex("01000003aabbcc"));
        t.appendHandshakeMessage(m);
        const before = t.digest();
        t.appendHandshakeMessage(new Uint8Array());
        expect(Bytes.toHex(t.digest())).to.equal(Bytes.toHex(before));
    });
});
