/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { GeneralDiagnosticsServer } from "#behaviors/general-diagnostics";
import { MockServerNode } from "../../node/mock-server-node.js";

describe("GeneralDiagnosticsServer operational hours", () => {
    beforeEach(() => {
        MockTime.reset();
    });

    it("counts elapsed online time normally", async () => {
        const node = await MockServerNode.createOnline();

        await MockTime.advance(90 * 60_000);

        expect(node.stateOf(GeneralDiagnosticsServer).totalOperationalHours).equals(1);

        await node.close();
    });

    it("keeps totalOperationalHours non-negative across a backward wall-clock step", async () => {
        const node = await MockServerNode.createOnline();

        await MockTime.advance(10 * 60_000);

        // Simulate an NTP correction that steps the wall clock back two hours, well before
        // lastTotalOperationalHoursCounterUpdateTime.
        MockTime.atTime(MockTime.nowMs - 2 * 60 * 60_000, () => {
            expect(node.stateOf(GeneralDiagnosticsServer).totalOperationalHours).is.at.least(0);
        });

        await node.close();
    });

    it("keeps upTime non-negative across a backward wall-clock step", async () => {
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

        // Time.nowUs carries sub-millisecond precision on real platforms (see Time.ts); MockTime's nowUs normally
        // mirrors its integer nowMs, so fake a fractional reading to exercise the rounding.
        const original = Object.getOwnPropertyDescriptor(MockTime, "nowUs")!;
        Object.defineProperty(MockTime, "nowUs", {
            configurable: true,
            get: () => MockTime.nowMs + 0.4,
        });

        try {
            await MockTime.advance(10 * 60_000); // let the periodic timer fire at least once
        } finally {
            Object.defineProperty(MockTime, "nowUs", original);
        }

        const counter = node.stateOf(GeneralDiagnosticsServer).totalOperationalHoursCounter;
        expect(counter).is.greaterThan(0);
        expect(Number.isInteger(counter)).equals(true);

        await node.close();
    });

    it("takes the node offline cleanly after a backward wall-clock step", async () => {
        const node = await MockServerNode.createOnline();

        await MockTime.advance(10 * 60_000);

        // #goingOffline runs #updateTotalOperationalHoursCounter, which on base computes a negative elapsed time
        // here and fails validation (uint64 minimum 0) while the node is shutting down.
        await MockTime.atTime(MockTime.nowMs - 2 * 60 * 60_000, () => node.close());

        expect(node.lifecycle.isOnline).equals(false);
    });
});
