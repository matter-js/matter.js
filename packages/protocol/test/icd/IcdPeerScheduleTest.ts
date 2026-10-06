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
        expect(s.nextCheckInDue).undefined;
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
            expect(s.nextCheckInDue).equal(at(Seconds(20) + Seconds(30) + MARGIN));
        });

        it("moves with later activity", () => {
            const s = schedule();
            s.noteCheckIn(T0);
            s.noteActive(at(Seconds(100)));
            expect(s.nextCheckInDue).equal(at(Seconds(104) + Seconds(30) + MARGIN));
        });

        it("follows new timings", () => {
            const s = schedule();
            s.noteActive(T0);
            s.timings = { ...s.timings, idleModeDuration: Seconds(60) };
            expect(s.nextCheckInDue).equal(at(Seconds(4) + Seconds(60) + MARGIN));
        });
    });

    it("has an idle window of idleModeDuration plus margin", () => {
        expect(schedule().idleWindow).equal(Millis(Seconds(30) + MARGIN));
    });
});
