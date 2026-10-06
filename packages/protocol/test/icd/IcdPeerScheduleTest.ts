/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdPeerSchedule } from "#icd/IcdPeerSchedule.js";
import { Millis, Seconds, Timestamp } from "@matter/general";

const T0 = Timestamp(1_000_000);

function at(offset: number) {
    return Timestamp(T0 + offset);
}

function schedule(timings: Partial<IcdPeerSchedule.Timings> = {}) {
    const result = new IcdPeerSchedule();
    result.timings = {
        activeModeThreshold: Seconds(4),
        activeModeDuration: Millis(0),
        idleModeDuration: Seconds(30),
        ...timings,
    };
    return result;
}

const MARGIN = IcdPeerSchedule.CHECK_IN_MARGIN;

describe("IcdPeerSchedule", () => {
    it("has no deadlines before any activity", () => {
        const s = schedule();
        expect(s.activeUntil).undefined;
        expect(s.nextSignalDue()).undefined;
    });

    describe("Active Mode", () => {
        it("lasts activeModeThreshold after activity", () => {
            const s = schedule();
            s.noteActive(T0);
            expect(s.activeUntil).equal(at(Seconds(4)));
        });

        it("lasts activeModeDuration after a Check-In when that is longer", () => {
            const s = schedule({ activeModeDuration: Seconds(20) });
            s.noteCheckIn(T0);
            expect(s.activeUntil).equal(at(Seconds(20)));
        });

        it("uses the threshold a Check-In carries", () => {
            const s = schedule();
            s.noteCheckIn(T0, Seconds(9));
            expect(s.activeUntil).equal(at(Seconds(9)));
        });

        it("does not apply activeModeDuration to activity other than a Check-In", () => {
            const s = schedule({ activeModeDuration: Seconds(20) });
            s.noteActive(T0);
            expect(s.activeUntil).equal(at(Seconds(4)));
        });

        it("is not shortened by later activity", () => {
            const s = schedule({ activeModeDuration: Seconds(20) });
            s.noteCheckIn(T0);
            s.noteActive(at(Seconds(10)));
            expect(s.activeUntil).equal(at(Seconds(20)));
        });

        it("lasts until a StayActive promise ends", () => {
            const s = schedule();
            s.noteActive(T0);
            s.noteStayActive(T0, Seconds(60));
            expect(s.activeUntil).equal(at(Seconds(60)));
        });
    });

    describe("next Check-In", () => {
        it("is due idleModeDuration plus margin after Active Mode", () => {
            const s = schedule({ activeModeDuration: Seconds(20) });
            s.noteCheckIn(T0);
            expect(s.nextSignalDue()).equal(at(Seconds(20) + Seconds(30) + MARGIN));
        });

        it("allows maximumCheckInBackoff when the controller did not interact since the Check-In", () => {
            const s = schedule({ maximumCheckInBackoff: Seconds(120) });
            s.noteCheckIn(T0);
            expect(s.nextSignalDue()).equal(at(Seconds(4) + Seconds(120) + MARGIN));
        });

        it("keeps the idle cadence once the peer answered a message from the controller", () => {
            const s = schedule({ maximumCheckInBackoff: Seconds(120) });
            s.noteCheckIn(T0);
            s.noteSent();
            s.noteActive(at(Seconds(1)));
            expect(s.nextSignalDue()).equal(at(Seconds(5) + Seconds(30) + MARGIN));
        });

        it("keeps the back-off when the peer shows activity the controller did not prompt", () => {
            const s = schedule({ maximumCheckInBackoff: Seconds(120) });
            s.noteCheckIn(T0);
            s.noteActive(at(Seconds(1)));
            expect(s.nextSignalDue()).equal(at(Seconds(5) + Seconds(120) + MARGIN));
        });

        it("does not count a message the peer never answered as an interaction", () => {
            const s = schedule({ maximumCheckInBackoff: Seconds(120) });
            s.noteCheckIn(T0);
            s.noteSent();
            expect(s.nextSignalDue()).equal(at(Seconds(4) + Seconds(120) + MARGIN));
        });

        it("does not count a message sent before the Check-In as an interaction", () => {
            const s = schedule({ maximumCheckInBackoff: Seconds(120) });
            s.noteSent();
            s.noteCheckIn(T0);
            s.noteActive(at(Seconds(1)));
            expect(s.nextSignalDue()).equal(at(Seconds(5) + Seconds(120) + MARGIN));
        });

        it("forgets an interaction at the next Check-In", () => {
            const s = schedule({ maximumCheckInBackoff: Seconds(120) });
            s.noteCheckIn(T0);
            s.noteSent();
            s.noteActive(at(Seconds(1)));
            s.noteCheckIn(at(Seconds(40)));
            expect(s.nextSignalDue()).equal(at(Seconds(44) + Seconds(120) + MARGIN));
        });

        it("ignores a maximumCheckInBackoff not longer than idleModeDuration", () => {
            const s = schedule({ maximumCheckInBackoff: Seconds(30) });
            s.noteCheckIn(T0);
            expect(s.nextSignalDue()).equal(at(Seconds(4) + Seconds(30) + MARGIN));
        });
    });

    describe("next report", () => {
        it("is due when the subscription times out after the last activity", () => {
            const s = schedule({ maximumCheckInBackoff: Seconds(120) });
            s.noteActive(T0);
            expect(s.nextSignalDue(Seconds(70))).equal(at(Seconds(70)));
        });

        it("is undefined before any activity, even with a StayActive promise", () => {
            const s = schedule();
            s.noteStayActive(T0, Seconds(60));
            expect(s.nextSignalDue(Seconds(70))).undefined;
        });

        it("is not before the end of Active Mode", () => {
            const s = schedule();
            s.noteActive(T0);
            s.noteStayActive(T0, Seconds(300));
            expect(s.nextSignalDue(Seconds(70))).equal(at(Seconds(300)));
        });
    });
});
