/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdPeerSchedule } from "#icd/IcdPeerSchedule.js";
import { IcdPeerWakefulness } from "#icd/IcdPeerWakefulness.js";
import { Hours, Millis, Seconds, Time } from "@matter/general";

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

    it("is always awake and available while the peer needs no awaiting", async () => {
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
        expect(w.nextCheckInDue).undefined;
        expect(missed).equals(0);
    });

    it("starts asleep and unavailable for a LIT peer without activity", () => {
        const { w } = lit();
        expect(w.awake.value).equals(false);
        expect(w.available.value).equals(false);
        expect(w.nextCheckInDue).undefined;
    });

    it("is awake for the Active Mode and available until the next Check-In is due", async () => {
        const { w, missed } = lit();
        w.noteActive();
        expect(w.awake.value).equals(true);
        expect(w.nextCheckInDue).equals(Time.nowUs + CHECK_IN_DUE);

        await MockTime.advance(Millis(TIMINGS.activeModeThreshold + 1));
        expect(w.awake.value).equals(false);
        expect(w.available.value).equals(true);

        await MockTime.advance(Millis(CHECK_IN_DUE - TIMINGS.activeModeThreshold));
        expect(w.available.value).equals(false);
        expect(w.nextCheckInDue).undefined;
        expect(missed.count).equals(1);
    });

    it("applies the threshold a Check-In carries", async () => {
        const { w } = lit();
        w.noteCheckIn(Seconds(20));
        await MockTime.advance(Seconds(19));
        expect(w.awake.value).equals(true);
    });

    it("stays awake for a StayActive promise and available for an idle period after it", async () => {
        const { w } = lit();
        w.noteActive();
        w.noteStayActive(Seconds(60));
        await MockTime.advance(Seconds(59));
        expect(w.awake.value).equals(true);
        expect(w.nextCheckInDue).equals(
            Time.nowUs + Seconds(1) + TIMINGS.idleModeDuration + IcdPeerSchedule.CHECK_IN_MARGIN,
        );
    });

    it("applies new timings at once", async () => {
        const { w, missed } = lit();
        w.noteActive();
        await MockTime.advance(Seconds(20));

        w.setTimings({ ...TIMINGS, idleModeDuration: Seconds(1) }); // due at 4s + 1s + 10s, already passed

        expect(w.available.value).equals(false);
        expect(missed.count).equals(1);
    });

    describe("clock", () => {
        it("keeps its deadline across a forward wall-clock step", () => {
            const { w } = lit();
            w.noteActive();
            MockTime.stepWallClock(Hours(1));
            expect(w.nextCheckInDue).not.undefined;
        });

        it("ends Active Mode on time across a backward wall-clock step", async () => {
            const { w } = lit();
            w.noteActive();
            await MockTime.advance(Millis(TIMINGS.activeModeThreshold + 1));
            MockTime.stepWallClock(Hours(-1));
            w.noteStayActive(Millis(0));
            expect(w.awake.value).equals(false);
        });
    });

    describe("subscription", () => {
        it("keeps the peer available without a deadline while a subscription is held", async () => {
            const { w, missed } = lit();
            using _subscription = w.holdSubscription();
            w.noteActive();
            expect(w.nextCheckInDue).undefined;

            await MockTime.advance(Hours(5));
            expect(w.available.value).equals(true);
            expect(missed.count).equals(0);
        });

        it("keeps the peer available while any of several subscriptions is held", async () => {
            const { w, missed } = lit();
            using _remaining = w.holdSubscription();
            const released = w.holdSubscription();
            w.noteActive();
            released[Symbol.dispose]();

            await MockTime.advance(Hours(5));
            expect(w.available.value).equals(true);
            expect(missed.count).equals(0);
        });

        it("expects the next Check-In again once the last subscription is released", () => {
            const { w } = lit();
            const subscription = w.holdSubscription();
            w.noteActive();
            subscription[Symbol.dispose]();
            expect(w.nextCheckInDue).equals(Time.nowUs + CHECK_IN_DUE);
        });

        it("reports a missed Check-In when the released subscription leaves it overdue", async () => {
            const { w, missed } = lit();
            const subscription = w.holdSubscription();
            w.noteActive();
            await MockTime.advance(Hours(1));
            expect(missed.count).equals(0);

            subscription[Symbol.dispose]();
            expect(w.available.value).equals(false);
            expect(missed.count).equals(1);
        });
    });

    describe("nextCheckInWithin", () => {
        it("is the idle window without a deadline", () => {
            const { w } = lit();
            expect(w.nextCheckInWithin).equals(Millis(TIMINGS.idleModeDuration + IcdPeerSchedule.CHECK_IN_MARGIN));
        });

        it("is the idle window when the deadline is closer", async () => {
            const { w } = lit();
            w.noteActive();
            await MockTime.advance(Seconds(10));
            expect(w.nextCheckInWithin).equals(Millis(TIMINGS.idleModeDuration + IcdPeerSchedule.CHECK_IN_MARGIN));
        });

        it("is the time to the deadline when that is longer", () => {
            const { w } = lit();
            w.noteActive();
            w.noteStayActive(Seconds(60));
            expect(w.nextCheckInWithin).equals(
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

        it("does not report a missed Check-In when awaiting starts with an overdue deadline", async () => {
            const w = new IcdPeerWakefulness();
            w.setTimings(TIMINGS);
            let missed = 0;
            w.checkInMissed.on(() => {
                missed++;
            });
            w.noteActive();
            await MockTime.advance(Millis(CHECK_IN_DUE + 1));

            w.requiresAwait = true;
            expect(w.available.value).equals(false);
            expect(missed).equals(0);
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
            expect(w.available.value).equals(true);
            expect(w.nextCheckInDue).undefined;
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

        it("does not report a missed Check-In when resuming with an overdue deadline", async () => {
            const { w, missed } = lit();
            w.noteActive();
            w.suspend();
            await MockTime.advance(Millis(CHECK_IN_DUE + 1));

            w.resume();
            expect(w.available.value).equals(false);
            expect(missed.count).equals(0);
        });

        it("resumes from the observed activity", () => {
            const { w } = lit();
            w.noteActive();
            const due = w.nextCheckInDue;
            w.suspend();
            w.resume();
            expect(w.nextCheckInDue).equals(due);
        });
    });

    describe("close", () => {
        it("keeps the timers stopped when a subscription is released afterwards", async () => {
            const { w, missed } = lit();
            const subscription = w.holdSubscription();
            w.noteActive();
            w.close();
            subscription[Symbol.dispose]();
            w.resume();

            await MockTime.advance(Hours(1));
            expect(missed.count).equals(0);
            expect(w.nextCheckInDue).undefined;
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
