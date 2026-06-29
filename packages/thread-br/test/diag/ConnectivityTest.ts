/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { Connectivity } from "../../src/tlv/diag/Connectivity.js";

describe("Connectivity", () => {
    it("decodes a full 10-byte form", () => {
        // priority=high (0b01<<6 = 0x40), lq3=2, lq2=4, lq1=6, leaderCost=2,
        // idSeq=0x80, activeRouters=10, sedBufferSize=1280 (0x0500), sedDatagrams=1.
        const value = new Uint8Array([0x40, 2, 4, 6, 2, 0x80, 10, 0x05, 0x00, 1]);
        const c = Connectivity.decode(value);
        expect(c.parentPriority).to.equal(1);
        expect(c.linkQuality3).to.equal(2);
        expect(c.linkQuality2).to.equal(4);
        expect(c.linkQuality1).to.equal(6);
        expect(c.leaderCost).to.equal(2);
        expect(c.idSequence).to.equal(0x80);
        expect(c.activeRouters).to.equal(10);
        expect(c.sedBufferSize).to.equal(1280);
        expect(c.sedDatagramCount).to.equal(1);
    });

    it("decodes a low-priority parent", () => {
        const c = Connectivity.decode(new Uint8Array([0xc0, 1, 2, 3, 4, 5, 6, 0, 0, 0]));
        expect(c.parentPriority).to.equal(-1);
    });

    it("decodes a medium-priority parent (0b00 and 0b10 both map to 0)", () => {
        expect(Connectivity.decode(new Uint8Array([0x00, 0, 0, 0, 0, 0, 0, 0, 0, 0])).parentPriority).to.equal(0);
        expect(Connectivity.decode(new Uint8Array([0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0])).parentPriority).to.equal(0);
    });

    it("decodes the optional 7-byte short form with default SED fields", () => {
        const c = Connectivity.decode(new Uint8Array([0x40, 1, 2, 3, 4, 5, 6]));
        expect(c.parentPriority).to.equal(1);
        expect(c.linkQuality3).to.equal(1);
        expect(c.activeRouters).to.equal(6);
        expect(c.sedBufferSize).to.equal(1280);
        expect(c.sedDatagramCount).to.equal(1);
    });

    it("round-trips the full form", () => {
        const c: Connectivity = {
            parentPriority: -1,
            linkQuality3: 1,
            linkQuality2: 2,
            linkQuality1: 3,
            leaderCost: 4,
            idSequence: 5,
            activeRouters: 6,
            sedBufferSize: 4096,
            sedDatagramCount: 8,
        };
        expect(Connectivity.decode(Connectivity.encode(c))).to.deep.equal(c);
    });

    it("rejects unexpected sizes", () => {
        expect(() => Connectivity.decode(new Uint8Array(6))).to.throw(/Connectivity/);
        expect(() => Connectivity.decode(new Uint8Array(8))).to.throw(/Connectivity/);
        expect(() => Connectivity.decode(new Uint8Array(11))).to.throw(/Connectivity/);
    });
});
