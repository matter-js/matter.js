/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BleListeningClock } from "#common/BleListeningClock.js";
import { Seconds } from "@matter/general";

describe("BleListeningClock", () => {
    beforeEach(() => MockTime.reset());
    after(() => MockTime.disable());

    it("counts nothing before the radio scans", async () => {
        const clock = new BleListeningClock();
        await MockTime.advance(Seconds(10));
        expect(clock.total).equal(0);
    });

    it("includes a scan that is still running", async () => {
        const clock = new BleListeningClock();
        clock.start();
        await MockTime.advance(Seconds(3));
        expect(clock.total).equal(Seconds(3));
    });

    it("adds up separate scans and leaves out the time between them", async () => {
        const clock = new BleListeningClock();
        clock.start();
        await MockTime.advance(Seconds(2));
        clock.stop();
        await MockTime.advance(Seconds(10));
        clock.start();
        await MockTime.advance(Seconds(3));
        clock.stop();
        expect(clock.total).equal(Seconds(5));
    });

    it("keeps the start of a scan when the radio reports it again", async () => {
        const clock = new BleListeningClock();
        clock.start();
        await MockTime.advance(Seconds(2));
        clock.start();
        await MockTime.advance(Seconds(2));
        expect(clock.total).equal(Seconds(4));
    });

    it("ignores a stop without a running scan", async () => {
        const clock = new BleListeningClock();
        clock.start();
        await MockTime.advance(Seconds(2));
        clock.stop();
        clock.stop();
        expect(clock.total).equal(Seconds(2));
    });
});
