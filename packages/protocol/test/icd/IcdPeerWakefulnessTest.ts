/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdPeerSchedule } from "#icd/IcdPeerSchedule.js";
import { IcdPeerWakefulness } from "#icd/IcdPeerWakefulness.js";
import { Millis, Seconds, Time } from "@matter/general";

const TIMINGS: IcdPeerSchedule.Timings = {
    activeModeThreshold: Seconds(4),
    activeModeDuration: Millis(0),
    idleModeDuration: Seconds(30),
};

/** Deadline of the next Check-In after activity with {@link TIMINGS}. */
const CHECK_IN_DUE = Millis(TIMINGS.activeModeThreshold + TIMINGS.idleModeDuration + IcdPeerSchedule.CHECK_IN_MARGIN);

describe("IcdPeerWakefulness", () => {
    before(MockTime.enable);

    function lit() {
        const w = new IcdPeerWakefulness();
        w.setTimings(TIMINGS);
        w.requiresAwait = true;
        const missed = { count: 0 };
        w.checkInMissed.on(() => {
            missed.count++;
        });
        return { w, missed };
    }

    it("is always awake and available while the peer needs no awaiting", () => {
        const w = new IcdPeerWakefulness();
        expect(w.awake.value).equals(true);
        expect(w.available.value).equals(true);
        expect(w.nextSignalDue).undefined;
    });

    it("never arms timers for a peer that needs no awaiting", async () => {
        const w = new IcdPeerWakefulness();
        w.setTimings(TIMINGS);
        let missed = 0;
        w.checkInMissed.on(() => {
            missed++;
        });
        w.noteActive();

        await MockTime.advance(Millis(CHECK_IN_DUE + 1));
        expect(w.awake.value).equals(true);
        expect(w.available.value).equals(true);
        expect(missed).equals(0);
    });

    it("applies new timings at once", async () => {
        const { w } = lit();
        w.noteActive();
        await MockTime.advance(Seconds(20));

        w.setTimings({ ...TIMINGS, idleModeDuration: Seconds(1) }); // due at 4s + 1s + 10s, already passed

        expect(w.available.value).equals(false);
        expect(w.nextSignalDue).undefined;
    });

    it("starts asleep and unavailable for a LIT peer without activity", () => {
        const { w } = lit();
        expect(w.awake.value).equals(false);
        expect(w.available.value).equals(false);
        expect(w.nextSignalDue).undefined;
    });

    it("is awake for the Active Mode and available until the next Check-In is due", async () => {
        const { w, missed } = lit();
        w.noteActive();
        expect(w.awake.value).equals(true);
        expect(w.nextSignalDue).equals(Time.nowMs + CHECK_IN_DUE);

        await MockTime.advance(Millis(TIMINGS.activeModeThreshold + 1));
        expect(w.awake.value).equals(false);
        expect(w.available.value).equals(true);

        await MockTime.advance(Millis(CHECK_IN_DUE - TIMINGS.activeModeThreshold));
        expect(w.available.value).equals(false);
        expect(missed.count).equals(1);
    });

    it("applies the threshold a Check-In carries", async () => {
        const { w } = lit();
        w.noteCheckIn(Seconds(20));
        await MockTime.advance(Seconds(19));
        expect(w.awake.value).equals(true);
    });

    it("stays awake for a StayActive promise", async () => {
        const { w } = lit();
        w.noteActive();
        w.noteStayActive(Seconds(60));
        await MockTime.advance(Seconds(59));
        expect(w.awake.value).equals(true);
        expect(w.available.value).equals(true);
    });

    it("lets a message the peer answered shorten a back-off deadline", () => {
        const { w } = lit();
        w.setTimings({ ...TIMINGS, maximumCheckInBackoff: Seconds(120) });
        w.noteCheckIn();
        const backedOff = w.nextSignalDue;
        w.noteSent();
        w.noteActive();
        expect(w.nextSignalDue).lessThan(backedOff!);
    });

    describe("report cadence", () => {
        it("makes the next report due when the longest held subscription times out", async () => {
            const { w, missed } = lit();
            using _long = w.reportCadence(Seconds(120));
            using _short = w.reportCadence(Seconds(60));
            w.noteActive();
            expect(w.nextSignalDue).equals(Time.nowMs + Seconds(120));

            await MockTime.advance(Seconds(119));
            expect(missed.count).equals(0);
            await MockTime.advance(Seconds(2));
            expect(missed.count).equals(1);
        });

        it("drops a released cadence's deadline at the next Check-In", () => {
            const { w } = lit();
            const cadence = w.reportCadence(Seconds(120));
            w.noteActive();
            cadence[Symbol.dispose]();

            w.noteCheckIn();
            expect(w.nextSignalDue).equals(Time.nowMs + CHECK_IN_DUE);
        });

        it("keeps the remaining subscription's cadence when another one is released", () => {
            const { w } = lit();
            using _remaining = w.reportCadence(Seconds(120));
            const released = w.reportCadence(Seconds(60));
            released[Symbol.dispose]();
            w.noteActive();
            expect(w.nextSignalDue).equals(Time.nowMs + Seconds(120));
        });

        it("keeps a released cadence's deadline until the peer shows activity again", async () => {
            const { w } = lit();
            const cadence = w.reportCadence(Seconds(120));
            w.noteActive();
            const due = w.nextSignalDue;
            cadence[Symbol.dispose]();
            expect(w.nextSignalDue).equals(due);

            await MockTime.advance(Seconds(1));
            w.noteActive();
            expect(w.nextSignalDue).equals(Time.nowMs + CHECK_IN_DUE);
        });
    });

    it("has no deadline once it is overdue", async () => {
        const { w } = lit();
        w.noteActive();
        await MockTime.advance(Millis(CHECK_IN_DUE + 1));
        expect(w.nextSignalDue).undefined;
    });

    describe("nextSignalWithin", () => {
        it("includes a Check-In back-off the peer may apply", () => {
            const { w } = lit();
            w.setTimings({ ...TIMINGS, maximumCheckInBackoff: Seconds(120) });
            expect(w.nextSignalWithin).equals(Millis(Seconds(120) + IcdPeerSchedule.CHECK_IN_MARGIN));
        });

        it("is the longest idle period without a deadline", () => {
            const { w } = lit();
            expect(w.nextSignalWithin).equals(Millis(TIMINGS.idleModeDuration + IcdPeerSchedule.CHECK_IN_MARGIN));
        });

        it("is the time to the deadline when that is longer", () => {
            const { w } = lit();
            w.noteActive();
            w.noteStayActive(Seconds(60));
            expect(w.nextSignalWithin).equals(
                Millis(Seconds(60) + TIMINGS.idleModeDuration + IcdPeerSchedule.CHECK_IN_MARGIN),
            );
        });
    });

    describe("operating mode", () => {
        it("forces awake and available when the peer stops requiring await", async () => {
            const { w, missed } = lit();
            w.noteActive();
            w.requiresAwait = false;
            expect(w.awake.value).equals(true);
            expect(w.available.value).equals(true);

            await MockTime.advance(Millis(CHECK_IN_DUE + 1));
            expect(missed.count).equals(0);
        });

        it("resumes from the observed activity when the peer requires await again", () => {
            const { w } = lit();
            w.noteActive();
            w.requiresAwait = false;
            w.requiresAwait = true;
            expect(w.awake.value).equals(true);
        });

        it("emits operatingModeChanged on each requiresAwait flip, not on a no-op set", async () => {
            const w = new IcdPeerWakefulness();
            const seen = new Array<boolean>();
            w.operatingModeChanged.on(value => {
                seen.push(value);
            });

            w.requiresAwait = false;
            w.requiresAwait = true;
            w.requiresAwait = true;
            w.requiresAwait = false;
            await MockTime.yield();

            expect(seen).deep.equals([true, false]);
        });

        it("does not report a missed Check-In when the peer starts requiring await", async () => {
            const { w, missed } = lit();
            await MockTime.yield();
            expect(w.available.value).equals(false);
            expect(missed.count).equals(0);
        });
    });

    describe("suspend", () => {
        it("releases parked consumers and stops reporting missed Check-Ins", async () => {
            const { w, missed } = lit();
            w.noteActive();
            await MockTime.advance(Millis(TIMINGS.activeModeThreshold + 1));
            expect(w.awake.value).equals(false);

            w.suspend();
            expect(w.awake.value).equals(true);
            expect(w.nextSignalDue).undefined;
            await MockTime.advance(Millis(CHECK_IN_DUE));
            expect(missed.count).equals(0);
        });

        it("keeps the timers stopped when activity is observed while suspended", async () => {
            const { w, missed } = lit();
            w.suspend();
            w.noteActive();

            await MockTime.advance(Millis(CHECK_IN_DUE + 1));
            expect(missed.count).equals(0);
            expect(w.awake.value).equals(true);
        });

        it("does not signal a mode change", async () => {
            const { w } = lit();
            let changes = 0;
            w.operatingModeChanged.on(() => {
                changes++;
            });
            w.suspend();
            await MockTime.yield();
            expect(changes).equals(0);
        });

        it("resumes from the observed activity", () => {
            const { w } = lit();
            w.noteActive();
            const due = w.nextSignalDue;
            w.suspend();
            w.resume();
            expect(w.nextSignalDue).equals(due);
        });
    });

    describe("close", () => {
        it("keeps the timers stopped when a report cadence is released afterwards", async () => {
            const { w, missed } = lit();
            const cadence = w.reportCadence(Seconds(60));
            w.noteActive();
            w.close();
            cadence[Symbol.dispose]();
            w.resume();

            await MockTime.advance(Seconds(120));
            expect(missed.count).equals(0);
            expect(w.nextSignalDue).undefined;
        });

        it("does not report a missed Check-In", async () => {
            const { w, missed } = lit();
            w.noteActive();
            w.close();
            await MockTime.advance(Millis(CHECK_IN_DUE + 1));
            expect(missed.count).equals(0);
        });

        it("releases a consumer parked on the awake edge", async () => {
            const { w } = lit();
            let released = false;
            w.awake.on(awake => {
                if (awake) {
                    released = true;
                }
            });
            w.close();
            await MockTime.yield();
            expect(released).equals(true);
            expect(w.awake.value).equals(true);
        });
    });
});
