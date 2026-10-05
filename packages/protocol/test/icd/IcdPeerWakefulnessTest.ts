/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdPeerWakefulness } from "#icd/IcdPeerWakefulness.js";
import { Millis, Seconds } from "@matter/general";

const SUBSCRIPTION = {};

/** Idle mode duration + active mode threshold + check-in margin of {@link lit}. */
const UNSUBSCRIBED_WINDOW = Millis(Seconds(30) + Millis(4000) + IcdPeerWakefulness.CHECK_IN_MARGIN);

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
        await MockTime.advance(Millis(UNSUBSCRIBED_WINDOW + 1));
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
        await MockTime.advance(Millis(Seconds(30) + IcdPeerWakefulness.CHECK_IN_MARGIN + 1));
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
        await MockTime.advance(Millis(UNSUBSCRIBED_WINDOW + 1));
        expect(w.available.value).equals(false);
        expect(fired).equals(1);
    });

    it("sizes the subscribed window from the report interval plus the injected report margin", async () => {
        const w = lit();
        w.setTimings({ reportMargin: Seconds(20) });
        let fired = 0;
        w.checkInMissed.on(() => {
            fired++;
        });
        w.noteSignal(); // idle-based window (30s + 4s threshold + 10s check-in margin)
        w.setActiveReportInterval(SUBSCRIPTION, Seconds(60)); // subscribed: 60s + 20s report margin = 80s

        // Past the idle-based window (44s) but before report interval + report margin (80s): no spurious lapse.
        await MockTime.advance(Millis(Seconds(70)));
        expect(w.available.value).equals(true);
        expect(fired).equals(0);

        // Past report interval + report margin: the window lapses and reports the miss.
        await MockTime.advance(Millis(Seconds(11)));
        expect(w.available.value).equals(false);
        expect(fired).equals(1);
    });

    it("falls back to the check-in margin for the subscribed window when no report margin is injected", async () => {
        const w = lit();
        let fired = 0;
        w.checkInMissed.on(() => {
            fired++;
        });
        w.noteSignal();
        w.setActiveReportInterval(SUBSCRIPTION, Seconds(60)); // 60s + CHECK_IN_MARGIN (10s) = 70s

        await MockTime.advance(Millis(Seconds(65)));
        expect(w.available.value).equals(true);
        expect(fired).equals(0);

        await MockTime.advance(Millis(Seconds(6)));
        expect(w.available.value).equals(false);
        expect(fired).equals(1);
    });

    it("reverts to the idle Check-In cadence when the report interval is cleared", async () => {
        const w = lit();
        let fired = 0;
        w.checkInMissed.on(() => {
            fired++;
        });
        w.setActiveReportInterval(SUBSCRIPTION, Seconds(60));
        w.setActiveReportInterval(SUBSCRIPTION, undefined); // subscription lost
        w.noteSignal(); // fresh Check-In -> idle-based window

        await MockTime.advance(Millis(UNSUBSCRIBED_WINDOW + 1));
        expect(w.available.value).equals(false);
        expect(fired).equals(1);
    });

    it("sizes the subscribed window from the longest report interval of several subscriptions", async () => {
        const w = lit();
        const short = {};
        const long = {};
        let fired = 0;
        w.checkInMissed.on(() => {
            fired++;
        });
        w.setActiveReportInterval(long, Seconds(120));
        w.setActiveReportInterval(short, Seconds(60));
        w.noteSignal(); // 120s + CHECK_IN_MARGIN (10s) = 130s, not 60s + 10s

        await MockTime.advance(Millis(Seconds(125)));
        expect(fired).equals(0);

        await MockTime.advance(Millis(Seconds(6)));
        expect(fired).equals(1);
    });

    it("keeps the remaining subscription's report interval when another subscription closes", async () => {
        const w = lit();
        const remaining = {};
        const closing = {};
        let fired = 0;
        w.checkInMissed.on(() => {
            fired++;
        });
        w.setActiveReportInterval(remaining, Seconds(120));
        w.setActiveReportInterval(closing, Seconds(60));
        w.setActiveReportInterval(closing, undefined);
        w.noteSignal(); // 120s + CHECK_IN_MARGIN (10s), not the idle-based 44s

        await MockTime.advance(Millis(Seconds(125)));
        expect(fired).equals(0);

        await MockTime.advance(Millis(Seconds(6)));
        expect(fired).equals(1);
    });

    it("extends the unsubscribed window by the active mode threshold", async () => {
        const w = lit();
        w.setTimings({ activeModeThreshold: Seconds(20) });
        let fired = 0;
        w.checkInMissed.on(() => {
            fired++;
        });
        w.noteSignal(); // 30s idle + 20s threshold + 10s margin = 60s

        await MockTime.advance(Millis(Seconds(55)));
        expect(fired).equals(0);

        await MockTime.advance(Millis(Seconds(6)));
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
        await MockTime.advance(Millis(Seconds(30) + IcdPeerWakefulness.CHECK_IN_MARGIN + 1));
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
