/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Seconds } from "@matter/general";
import { IcdMode, IcdModeState } from "../../../src/behaviors/icd-management/IcdMode.js";

function makeState() {
    const events: string[] = [];
    const state = new IcdModeState({
        activeModeDuration: Seconds(2),
        activeModeThreshold: Seconds(1),
        onActiveEntered: () => events.push("active"),
        onIdleEntered: () => events.push("idle"),
        onMayEnterIdle: () => events.push("may-idle"),
    });
    return { state, events };
}

describe("IcdModeState", () => {
    beforeEach(() => MockTime.reset());

    it("enters active mode on start", () => {
        const { state, events } = makeState();
        state.start();
        expect(state.mode).equals(IcdMode.Active);
        expect(events).deep.equals(["active"]);
    });

    it("signals may-enter-idle after the active window but stays active (no auto-transition)", async () => {
        const { state, events } = makeState();
        state.start();
        await MockTime.advance(2000); // activeModeDuration
        expect(events).deep.equals(["active", "may-idle"]);
        expect(state.mode).equals(IcdMode.Active); // still active until told to sleep
        await MockTime.advance(60000);
        expect(events).deep.equals(["active", "may-idle"]); // nothing auto-cycles
    });

    it("enters idle only when told, unconditionally", () => {
        const { state, events } = makeState();
        state.start();
        state.enterIdle(); // forced, even before the window elapsed
        expect(state.mode).equals(IcdMode.Idle);
        expect(events).deep.equals(["active", "idle"]);
    });

    it("comes back to active on requestActive while idle", () => {
        const { state, events } = makeState();
        state.start();
        state.enterIdle();
        const promised = state.requestActive(Seconds(5));
        expect(state.mode).equals(IcdMode.Active);
        expect(promised).equals(Seconds(5)); // 5s > activeModeDuration floor
        expect(events).deep.equals(["active", "idle", "active"]);
    });

    it("comes back to active on activity while idle", () => {
        const { state, events } = makeState();
        state.start();
        state.enterIdle();
        state.noteActivity();
        expect(state.mode).equals(IcdMode.Active);
        expect(events).deep.equals(["active", "idle", "active"]);
    });

    it("activity extends the active window, deferring may-enter-idle, never shortening", async () => {
        const { state, events } = makeState();
        state.start();
        await MockTime.advance(1500); // 0.5s before the 2s window
        state.noteActivity(); // window -> 1.5s + 1s threshold = 2.5s
        await MockTime.advance(900); // t=2.4s: not yet
        expect(events).deep.equals(["active"]);
        await MockTime.advance(200); // t=2.6s: window elapsed
        expect(events).deep.equals(["active", "may-idle"]);
        expect(state.mode).equals(IcdMode.Active);
    });

    it("requestActive never shortens an existing longer window", () => {
        const { state } = makeState();
        state.start();
        const long = state.requestActive(Seconds(8));
        const short = state.requestActive(Seconds(1));
        expect(short).equals(long);
    });

    it("stop halts the machine; enterIdle/noteActivity become no-ops", async () => {
        const { state, events } = makeState();
        state.start();
        state.stop();
        expect(state.mode).equals(IcdMode.Idle);
        state.noteActivity();
        state.enterIdle();
        await MockTime.advance(60000);
        expect(events).deep.equals(["active"]);
    });

    it("enterIdle is a no-op when already idle", () => {
        const { state, events } = makeState();
        state.start();
        state.enterIdle();
        state.enterIdle();
        expect(events).deep.equals(["active", "idle"]);
    });
});
