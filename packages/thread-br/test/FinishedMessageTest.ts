/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { ChangeCipherSpec, CHANGE_CIPHER_SPEC_BODY } from "../src/dtls/handshake/ChangeCipherSpec.js";
import { FINISHED_VERIFY_DATA_LEN, FinishedMessage } from "../src/dtls/handshake/FinishedMessage.js";

describe("FinishedMessage", () => {
    it("build round-trips the 12-byte verify_data", () => {
        const vd = Bytes.of(Bytes.fromHex("000102030405060708090a0b"));
        const wire = FinishedMessage.build(vd);
        expect(Bytes.areEqual(wire, vd)).to.equal(true);
        const parsed = FinishedMessage.parse(wire);
        expect(Bytes.areEqual(parsed.verifyData, vd)).to.equal(true);
    });

    it("build returns a copy that the caller cannot accidentally mutate", () => {
        const vd = new Uint8Array(FINISHED_VERIFY_DATA_LEN);
        const wire = FinishedMessage.build(vd);
        wire[0] = 0xff;
        expect(vd[0]).to.equal(0);
    });

    it("rejects verify_data of any other length", () => {
        expect(() => FinishedMessage.build(new Uint8Array(11))).to.throw();
        expect(() => FinishedMessage.build(new Uint8Array(13))).to.throw();
        expect(() => FinishedMessage.parse(new Uint8Array(0))).to.throw();
        expect(() => FinishedMessage.parse(new Uint8Array(20))).to.throw();
    });
});

describe("ChangeCipherSpec", () => {
    it("CHANGE_CIPHER_SPEC_BODY is a single 0x01 byte (RFC 5246 §7.1)", () => {
        expect(CHANGE_CIPHER_SPEC_BODY.length).to.equal(1);
        expect(CHANGE_CIPHER_SPEC_BODY[0]).to.equal(0x01);
    });

    it("parse accepts the canonical 0x01 byte", () => {
        ChangeCipherSpec.parse(CHANGE_CIPHER_SPEC_BODY);
    });

    it("parse rejects everything else", () => {
        expect(() => ChangeCipherSpec.parse(new Uint8Array(0))).to.throw();
        expect(() => ChangeCipherSpec.parse(Bytes.of(Bytes.fromHex("00")))).to.throw();
        expect(() => ChangeCipherSpec.parse(Bytes.of(Bytes.fromHex("0102")))).to.throw();
    });
});
