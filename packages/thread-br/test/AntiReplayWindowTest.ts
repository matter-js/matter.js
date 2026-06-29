/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { AntiReplayWindow } from "../src/dtls/record/AntiReplayWindow.js";

describe("AntiReplayWindow", () => {
    it("accepts a strictly monotonic sequence", () => {
        const w = new AntiReplayWindow();
        for (let i = 0n; i < 1000n; i++) {
            expect(w.check(i)).to.equal(true);
        }
        expect(w.rightmost).to.equal(999n);
    });

    it("rejects an immediate replay of the rightmost", () => {
        const w = new AntiReplayWindow();
        expect(w.check(10n)).to.equal(true);
        expect(w.check(10n)).to.equal(false);
    });

    it("accepts an out-of-order seq within the window once, rejects on replay", () => {
        const w = new AntiReplayWindow();
        expect(w.check(100n)).to.equal(true);
        expect(w.check(98n)).to.equal(true);
        expect(w.check(99n)).to.equal(true);
        expect(w.check(98n)).to.equal(false);
        expect(w.check(99n)).to.equal(false);
        expect(w.check(100n)).to.equal(false);
    });

    it("rejects a seq older than rightmost - WINDOW_SIZE", () => {
        const w = new AntiReplayWindow();
        expect(w.check(100n)).to.equal(true);
        // Window covers [100-63, 100] = [37, 100]; 36 is just outside.
        expect(w.check(37n)).to.equal(true);
        expect(w.check(36n)).to.equal(false);
    });

    it("slides the window on a forward jump and forgets old bits", () => {
        const w = new AntiReplayWindow();
        expect(w.check(1n)).to.equal(true);
        // Jumping by WINDOW_SIZE pushes the original seq exactly to the trailing edge offset.
        expect(w.check(1n + 64n)).to.equal(true);
        // seq=1 is now at offset 64, outside the [rightmost-63, rightmost] window — discarded.
        expect(w.check(1n)).to.equal(false);
    });

    it("clamps the bitmap to 64 bits when shift >= WINDOW_SIZE", () => {
        const w = new AntiReplayWindow();
        // Pre-fill the window with three accepted seqs.
        expect(w.check(50n)).to.equal(true);
        expect(w.check(40n)).to.equal(true);
        expect(w.check(30n)).to.equal(true);
        // Jump far ahead — bitmap should reset to just the new rightmost.
        expect(w.check(1000n)).to.equal(true);
        expect(w.check(1000n)).to.equal(false);
        // Anything within the new window-size of 1000 is still fresh except 1000 itself.
        expect(w.check(940n)).to.equal(true);
    });

    it("accepts seq=0 as the first sample", () => {
        const w = new AntiReplayWindow();
        expect(w.check(0n)).to.equal(true);
        expect(w.check(0n)).to.equal(false);
        expect(w.check(1n)).to.equal(true);
    });

    it("accepts the maximum 48-bit sequence number", () => {
        const w = new AntiReplayWindow();
        const maxSeq = (1n << 48n) - 1n;
        expect(w.check(maxSeq)).to.equal(true);
        expect(w.check(maxSeq)).to.equal(false);
    });

    it("rejects negative or out-of-range inputs", () => {
        const w = new AntiReplayWindow();
        expect(() => w.check(-1n)).to.throw(/range/);
        expect(() => w.check(1n << 48n)).to.throw(/range/);
    });

    it("WINDOW_SIZE constant is 64", () => {
        expect(AntiReplayWindow.WINDOW_SIZE).to.equal(64);
    });
});
