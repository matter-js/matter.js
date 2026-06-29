/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "@matter/main";
import { Timeout } from "../../src/tlv/diag/Timeout.js";

describe("Timeout", () => {
    it("decodes a 240-second SED polling period", () => {
        expect(Timeout.decode(Bytes.of(Bytes.fromHex("000000f0")))).to.equal(240);
    });

    it("decodes a uint32 boundary value (0xFFFFFFFF)", () => {
        expect(Timeout.decode(new Uint8Array([0xff, 0xff, 0xff, 0xff]))).to.equal(0xffffffff);
    });

    it("round-trips arbitrary values", () => {
        for (const v of [0, 1, 0x12345678, 0xffffffff]) {
            expect(Timeout.decode(Timeout.encode(v))).to.equal(v);
        }
    });

    it("rejects bad sizes", () => {
        expect(() => Timeout.decode(new Uint8Array([0]))).to.throw(/4 bytes/);
        expect(() => Timeout.decode(new Uint8Array([0, 0, 0, 0, 0]))).to.throw(/4 bytes/);
    });

    it("rejects out-of-range encode inputs", () => {
        expect(() => Timeout.encode(-1)).to.throw(/range/);
        expect(() => Timeout.encode(0x100000000)).to.throw(/range/);
    });
});
