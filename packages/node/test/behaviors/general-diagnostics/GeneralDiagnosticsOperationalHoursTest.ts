/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneralDiagnosticsServer } from "#behaviors/general-diagnostics";
import { Time } from "@matter/general";
import { MockServerNode } from "../../node/mock-server-node.js";

describe("GeneralDiagnosticsServer operational hours", () => {
    beforeEach(() => {
        MockTime.reset();
    });

    it("counts elapsed online time normally", async () => {
        const node = await MockServerNode.createOnline();

        await MockTime.advance(90 * 60_000);

        expect(node.stateOf(GeneralDiagnosticsServer).totalOperationalHours).equals(1);
        expect(node.stateOf(GeneralDiagnosticsServer).upTime).equals(90 * 60);

        await node.close();
    });

    it("keeps the operational time counted across a backward wall-clock step", async () => {
        const node = await MockServerNode.createOnline();

        // Just past the second five-minute update
        await MockTime.advance(10 * 60_000 + 1_000);
        expect(node.stateOf(GeneralDiagnosticsServer).totalOperationalHoursCounter).equals(10 * 60_000);

        MockTime.stepWallClock(-2 * 60 * 60_000);
        await MockTime.advance(5 * 60_000);

        expect(node.stateOf(GeneralDiagnosticsServer).totalOperationalHoursCounter).equals(15 * 60_000);

        await node.close();
    });

    it("keeps upTime counting across a backward wall-clock step", async () => {
        const node = await MockServerNode.createOnline();

        await MockTime.advance(5 * 60_000);
        MockTime.stepWallClock(-2 * 60 * 60_000);
        expect(node.stateOf(GeneralDiagnosticsServer).upTime).equals(300);

        await MockTime.advance(60_000);
        expect(node.stateOf(GeneralDiagnosticsServer).upTime).equals(360);

        await node.close();
    });

    it("folds a forward wall-clock step (a suspend) into upTime", async () => {
        const node = await MockServerNode.createOnline();

        await MockTime.advance(5 * 60_000);
        expect(node.stateOf(GeneralDiagnosticsServer).upTime).equals(300);

        // The monotonic clock does not move, as it would not across a real suspend; the wall clock jumps ahead.
        MockTime.stepWallClock(10 * 60_000);
        expect(node.stateOf(GeneralDiagnosticsServer).upTime).equals(900);

        await node.close();
    });

    it("never lowers upTime when a backward step follows a forward one", async () => {
        const node = await MockServerNode.createOnline();

        await MockTime.advance(5 * 60_000);
        MockTime.stepWallClock(10 * 60_000);
        expect(node.stateOf(GeneralDiagnosticsServer).upTime).equals(900);

        // A correction back past the suspended wall-clock reading must not undo the upTime already reported.
        MockTime.stepWallClock(-20 * 60_000);
        expect(node.stateOf(GeneralDiagnosticsServer).upTime).equals(900);

        await node.close();
    });

    it("resets upTime's high-water mark across a restart", async () => {
        const node = await MockServerNode.createOnline();

        await MockTime.advance(5 * 60_000);
        MockTime.stepWallClock(10 * 60_000);
        expect(node.stateOf(GeneralDiagnosticsServer).upTime).equals(900);

        await MockTime.resolve(node.stop());
        await MockTime.resolve(node.start());

        expect(node.stateOf(GeneralDiagnosticsServer).upTime).equals(0);

        await node.close();
    });

    // MockTime.atTime moves the monotonic clock too, as Time.nowUs does where it falls back to the wall clock
    it("keeps totalOperationalHours non-negative when the clock steps backwards", async () => {
        const node = await MockServerNode.createOnline();

        await MockTime.advance(10 * 60_000);

        MockTime.atTime(MockTime.nowMs - 2 * 60 * 60_000, () => {
            expect(node.stateOf(GeneralDiagnosticsServer).totalOperationalHours).is.at.least(0);
        });

        await node.close();
    });

    it("keeps upTime non-negative when the clock steps backwards", async () => {
        const node = await MockServerNode.createOnline();

        await MockTime.advance(5 * 60_000);

        expect(node.stateOf(GeneralDiagnosticsServer).upTime).equals(300);

        MockTime.atTime(MockTime.nowMs - 2 * 60 * 60_000, () => {
            expect(node.stateOf(GeneralDiagnosticsServer).upTime).is.at.least(0);
        });

        await node.close();
    });

    it("keeps the persisted counter an integer despite a fractional Time.nowUs reading", async () => {
        const node = await MockServerNode.createOnline();

        // Time.nowUs carries sub-millisecond precision on real platforms.  Only the production reads are made
        // fractional; MockTime schedules its timers on its own integer clock.
        const original = Object.getOwnPropertyDescriptor(Time, "nowUs")!;
        Object.defineProperty(Time, "nowUs", {
            configurable: true,
            get: () => MockTime.nowUs + 0.4,
        });

        try {
            await MockTime.advance(10 * 60_000); // let the periodic timer fire at least once
        } finally {
            Object.defineProperty(Time, "nowUs", original);
        }

        const counter = node.stateOf(GeneralDiagnosticsServer).totalOperationalHoursCounter;
        expect(counter).is.greaterThan(0);
        expect(Number.isInteger(counter)).equals(true);

        await node.close();
    });

    it("takes the node offline cleanly when the clock steps backwards", async () => {
        const node = await MockServerNode.createOnline();

        await MockTime.advance(10 * 60_000);

        await MockTime.atTime(MockTime.nowMs - 2 * 60 * 60_000, () => node.close());

        expect(node.lifecycle.isOnline).equals(false);
    });
});
