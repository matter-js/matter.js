/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdPeerWakefulness } from "#icd/IcdPeerWakefulness.js";
import { Millis, Seconds } from "@matter/general";

describe("IcdPeerWakefulness", () => {
    before(MockTime.enable);

    function lit() {
        const w = new IcdPeerWakefulness();
        w.setTimings({ activeModeThreshold: Millis(4000), idleModeDuration: Seconds(30) });
        w.requiresAwait = true;
        return w;
    }

    it("non-LIT is always awake and available", () => {
        const w = new IcdPeerWakefulness();
        expect(w.awake.value).equals(true);
        expect(w.available.value).equals(true);
    });

    it("starts not-awake/not-available for a LIT peer with no signal", () => {
        const w = lit();
        expect(w.awake.value).equals(false);
        expect(w.available.value).equals(false);
    });

    it("noteSignal makes awake+available true, awake expires after SAT", async () => {
        const w = lit();
        w.noteSignal();
        expect(w.awake.value).equals(true);
        expect(w.available.value).equals(true);
        await MockTime.advance(Millis(4001));
        expect(w.awake.value).equals(false);
        expect(w.available.value).equals(true);
    });

    it("available expires after idleModeDuration + margin", async () => {
        const w = lit();
        w.noteSignal();
        await MockTime.advance(Millis(Seconds(30) + IcdPeerWakefulness.AVAILABILITY_MARGIN + 1));
        expect(w.available.value).equals(false);
    });

    it("noteStayActive extends the awake window", async () => {
        const w = lit();
        w.noteSignal();
        w.noteStayActive(Seconds(10));
        await MockTime.advance(Millis(4001));
        expect(w.awake.value).equals(true);
        await MockTime.advance(Seconds(7));
        expect(w.awake.value).equals(false);
    });

    it("noteStayActive past the idle window keeps available true (awake => available)", async () => {
        const w = lit();
        w.noteStayActive(Seconds(60));
        await MockTime.advance(Millis(Seconds(30) + IcdPeerWakefulness.AVAILABILITY_MARGIN + 1));
        expect(w.awake.value).equals(true);
        expect(w.available.value).equals(true);
        await MockTime.advance(Seconds(30));
        expect(w.awake.value).equals(false);
        expect(w.available.value).equals(false);
    });

    it("a LIT->SIT flip forces both true and cancels timers", () => {
        const w = lit();
        w.requiresAwait = false;
        expect(w.awake.value).equals(true);
        expect(w.available.value).equals(true);
    });

    it("operatingModeChanged emits the new value on each requiresAwait flip, not on a no-op set", async () => {
        const w = new IcdPeerWakefulness();
        const seen = new Array<boolean>();
        w.operatingModeChanged.on(value => {
            seen.push(value);
        });

        w.requiresAwait = false; // no-op (already false)
        w.requiresAwait = true; // SIT -> LIT
        w.requiresAwait = true; // no-op
        w.requiresAwait = false; // LIT -> SIT
        await MockTime.yield();

        expect(seen).deep.equals([true, false]);
    });

    it("close() releases a consumer parked on the awake edge", async () => {
        const w = lit();
        let released = false;
        w.awake.on(awake => {
            if (awake) {
                released = true;
            }
        });
        expect(w.awake.value).equals(false);
        w.close();
        await MockTime.yield();
        expect(released).equals(true);
        expect(w.awake.value).equals(true);
    });
});
