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

    it("checkInMissed fires once when the availability window lapses", async () => {
        const w = lit();
        let fired = 0;
        w.checkInMissed.on(() => {
            fired++;
        });
        w.noteSignal();
        await MockTime.advance(Millis(Seconds(30) + IcdPeerWakefulness.AVAILABILITY_MARGIN + 1));
        expect(w.available.value).equals(false);
        expect(fired).equals(1);
    });

    it("sizes the availability window from the negotiated report interval while subscribed", async () => {
        const w = lit();
        let fired = 0;
        w.checkInMissed.on(() => {
            fired++;
        });
        w.noteSignal(); // idle-based window (30s + 5s margin)
        w.setActiveReportInterval(Seconds(60)); // subscribed: reports arrive up to 60s

        // Past idle + margin (35s) but before the report cadence + margin (65s): no spurious lapse.
        await MockTime.advance(Millis(Seconds(40)));
        expect(w.available.value).equals(true);
        expect(fired).equals(0);

        // Past the report cadence + margin: the window finally lapses and reports the miss.
        await MockTime.advance(Millis(Seconds(30)));
        expect(w.available.value).equals(false);
        expect(fired).equals(1);
    });

    it("sizes the availability window from an injected check-in delivery margin", async () => {
        const w = lit();
        w.setTimings({ checkInDeliveryMargin: Seconds(20) });
        let fired = 0;
        w.checkInMissed.on(() => {
            fired++;
        });
        w.noteSignal(); // idle (30s) + injected margin (20s) = 50s window

        // Past idle + old fixed 5s margin (35s) but before idle + injected margin (50s): no spurious lapse.
        await MockTime.advance(Millis(Seconds(40)));
        expect(w.available.value).equals(true);
        expect(fired).equals(0);

        // Past idle + injected margin: the window lapses.
        await MockTime.advance(Millis(Seconds(11)));
        expect(w.available.value).equals(false);
        expect(fired).equals(1);
    });

    it("reverts to the idle Check-In cadence when the report interval is cleared", async () => {
        const w = lit();
        let fired = 0;
        w.checkInMissed.on(() => {
            fired++;
        });
        w.setActiveReportInterval(Seconds(60));
        w.setActiveReportInterval(undefined); // subscription lost
        w.noteSignal(); // fresh Check-In -> idle-based window

        await MockTime.advance(Millis(Seconds(30) + IcdPeerWakefulness.AVAILABILITY_MARGIN + 1));
        expect(w.available.value).equals(false);
        expect(fired).equals(1);
    });

    it("checkInMissed does not fire on a SIT->LIT requiresAwait flip", async () => {
        const w = new IcdPeerWakefulness();
        w.setTimings({ activeModeThreshold: Millis(4000), idleModeDuration: Seconds(30) });
        let fired = 0;
        w.checkInMissed.on(() => {
            fired++;
        });
        w.requiresAwait = true;
        await MockTime.yield();
        expect(w.available.value).equals(false);
        expect(fired).equals(0);
    });

    it("checkInMissed does not fire on close() teardown", async () => {
        const w = lit();
        w.noteSignal();
        let fired = 0;
        w.checkInMissed.on(() => {
            fired++;
        });
        w.close();
        await MockTime.yield();
        expect(fired).equals(0);
    });

    it("checkInMissed does not fire on a LIT->SIT flip that cancels the timer", async () => {
        const w = lit();
        w.noteSignal();
        let fired = 0;
        w.checkInMissed.on(() => {
            fired++;
        });
        w.requiresAwait = false;
        await MockTime.advance(Millis(Seconds(30) + IcdPeerWakefulness.AVAILABILITY_MARGIN + 1));
        expect(fired).equals(0);
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
