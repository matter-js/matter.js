/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BorderRouterEntry } from "../src/discovery/BorderRouterEntry.js";
import { decodeStateBitmap, selectBr } from "../src/selection/selectBr.js";

function makeBr(overrides: Partial<BorderRouterEntry>): BorderRouterEntry {
    return {
        extAddressHex: "AAAAAAAAAAAAAAAA",
        addresses: [],
        sources: ["meshcop"],
        lastSeen: 0,
        ...overrides,
    };
}

// Bit 7 set = BBR Active. value = 1 << 7 = 0x80.
const STATE_BBR_ACTIVE_ONLY = "00000080";
// Bits 7 and 8 set = BBR Active + Primary. value = 0x80 | 0x100 = 0x180.
const STATE_BBR_ACTIVE_PRIMARY = "00000180";

describe("selectBr", () => {
    it("returns undefined for an empty list", () => {
        expect(selectBr([])).to.equal(undefined);
    });

    it("returns the only entry when the list has length one", () => {
        const br = makeBr({ extAddressHex: "0123456789ABCDEF" });
        expect(selectBr([br])).to.equal(br);
    });

    it("prefers a BR with BBR Active + Primary state over one without", () => {
        const a = makeBr({ extAddressHex: "AAAAAAAAAAAAAAA1" });
        const b = makeBr({ extAddressHex: "AAAAAAAAAAAAAAA2", stateBitmapHex: STATE_BBR_ACTIVE_PRIMARY });
        expect(selectBr([a, b])).to.equal(b);
    });

    it("prefers a link-local-bearing BR among entries with equal state score", () => {
        const a = makeBr({ extAddressHex: "AAAAAAAAAAAAAAA1", addresses: ["192.168.1.1"] });
        const b = makeBr({ extAddressHex: "AAAAAAAAAAAAAAA2", addresses: ["fe80::1"] });
        expect(selectBr([a, b])).to.equal(b);
    });

    it("breaks remaining ties by ascending extAddressHex", () => {
        const a = makeBr({ extAddressHex: "BBBBBBBBBBBBBBBB" });
        const b = makeBr({ extAddressHex: "AAAAAAAAAAAAAAAA" });
        expect(selectBr([a, b])).to.equal(b);
    });

    it("picks the maximum combined score across mixed BRs", () => {
        // a: state=0 + ll=1 = 1
        const a = makeBr({ extAddressHex: "1111111111111111", addresses: ["fe80::1"] });
        // b: state=0 + ll=0 = 0
        const b = makeBr({ extAddressHex: "2222222222222222", addresses: ["192.168.1.1"] });
        // c: state=2 + ll=0 = 2 (winner)
        const c = makeBr({ extAddressHex: "3333333333333333", stateBitmapHex: STATE_BBR_ACTIVE_PRIMARY });
        expect(selectBr([a, b, c])).to.equal(c);
    });

    it("ranks an active-but-not-primary BBR above an ordinary link-local router", () => {
        // a: state=0 + ll=1 = 1
        const a = makeBr({ extAddressHex: "1111111111111111", addresses: ["fe80::1"] });
        // b: bbrActive but not primary → state score 2; no link-local → ll 0 = 2 (winner)
        const b = makeBr({ extAddressHex: "2222222222222222", stateBitmapHex: STATE_BBR_ACTIVE_ONLY });
        expect(selectBr([a, b])).to.equal(b);
    });

    it("ranks a primary BBR above an active-but-not-primary BBR", () => {
        // a: active-only → state 2
        const a = makeBr({ extAddressHex: "1111111111111111", stateBitmapHex: STATE_BBR_ACTIVE_ONLY });
        // b: active + primary → state 4 (winner)
        const b = makeBr({ extAddressHex: "2222222222222222", stateBitmapHex: STATE_BBR_ACTIVE_PRIMARY });
        expect(selectBr([a, b])).to.equal(b);
    });

    it("treats missing or malformed stateBitmapHex as no bits set", () => {
        const a = makeBr({ extAddressHex: "1111111111111111", stateBitmapHex: "ZZ" });
        const b = makeBr({ extAddressHex: "2222222222222222" });
        // Both score 0 → alphabetical wins.
        expect(selectBr([a, b])).to.equal(a);
    });

    it("link-local match is case-insensitive on the address prefix", () => {
        const a = makeBr({ extAddressHex: "AAAAAAAAAAAAAAA1", addresses: ["FE80::1"] });
        const b = makeBr({ extAddressHex: "AAAAAAAAAAAAAAA2" });
        expect(selectBr([a, b])).to.equal(a);
    });
});

describe("decodeStateBitmap", () => {
    it("returns false flags for undefined input", () => {
        expect(decodeStateBitmap(undefined)).to.deep.equal({ bbrActive: false, bbrPrimary: false });
    });

    it("returns false flags for an all-zero bitmap", () => {
        expect(decodeStateBitmap("00000000")).to.deep.equal({ bbrActive: false, bbrPrimary: false });
    });

    it("decodes bit 7 (BBR Active) when set alone", () => {
        expect(decodeStateBitmap("00000080")).to.deep.equal({ bbrActive: true, bbrPrimary: false });
    });

    it("decodes bit 8 (BBR Primary) when set alone", () => {
        expect(decodeStateBitmap("00000100")).to.deep.equal({ bbrActive: false, bbrPrimary: true });
    });

    it("decodes both bits 7 and 8 when set together", () => {
        expect(decodeStateBitmap("00000180")).to.deep.equal({ bbrActive: true, bbrPrimary: true });
    });

    it("accepts hex shorter than 8 chars (parsed as a number)", () => {
        // 0x180 = bits 7 and 8 set.
        expect(decodeStateBitmap("180")).to.deep.equal({ bbrActive: true, bbrPrimary: true });
    });

    it("returns false flags for non-hex input rather than throwing", () => {
        expect(decodeStateBitmap("ZZZZZZZZ")).to.deep.equal({ bbrActive: false, bbrPrimary: false });
    });

    it("returns false flags for the empty string", () => {
        expect(decodeStateBitmap("")).to.deep.equal({ bbrActive: false, bbrPrimary: false });
    });

    it("accepts mixed-case hex", () => {
        expect(decodeStateBitmap("0000018a")).to.deep.equal({ bbrActive: true, bbrPrimary: true });
    });
});
