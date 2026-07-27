/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const FAKE_TIME = 36000000;

describe("MockTime", () => {
    beforeEach(() => MockTime.reset(FAKE_TIME));

    describe("now", () => {
        it("returns the fake date", () => {
            const result = MockTime.now;

            expect(result.getTime()).equal(FAKE_TIME);
        });
    });

    describe("nowMs", () => {
        it("returns the fake time", () => {
            const result = MockTime.nowMs;

            expect(result).equal(FAKE_TIME);
        });
    });

    describe("advanceTime", () => {
        it("advances the time by the duration specified", async () => {
            await MockTime.advance(45);

            expect(MockTime.nowMs).equal(FAKE_TIME + 45);
        });
    });

    describe("getPeriodicTimer", () => {
        it("returns a periodic timer that will call a callback periodically", async () => {
            let firedTime;

            const result = MockTime.getPeriodicTimer("Test periodic", 30, () => (firedTime = MockTime.nowMs));
            expect(result.isRunning).equal(false);

            result.start();

            expect(result.isRunning).equal(true);
            expect(firedTime).equal(undefined);

            await MockTime.advance(45);

            expect(firedTime).equal(FAKE_TIME + 30);

            await MockTime.advance(20);

            expect(firedTime).equal(FAKE_TIME + 60);

            expect(result.isRunning).equal(true);

            result.stop();
            expect(result.isRunning).equal(false);
        });

        it("returns a periodic timer that can be stopped", async () => {
            let firedTime;

            const result = MockTime.getPeriodicTimer("Test periodic", 30, () => (firedTime = MockTime.nowMs));
            result.start();
            result.stop();

            expect(firedTime).equal(undefined);

            await MockTime.advance(45);

            expect(firedTime).equal(undefined);
            expect(result.isRunning).equal(false);
        });
    });

    describe("interval", () => {
        it("reports the construction duration", () => {
            expect(MockTime.getTimer("Test", 30, () => {}).interval).equal(30);
            expect(MockTime.getPeriodicTimer("Test periodic", 30, () => {}).interval).equal(30);
        });

        it("controls the fire time of a subsequent start", async () => {
            let firedTime;

            const timer = MockTime.getTimer("Test", 30, () => (firedTime = MockTime.nowMs));
            timer.start();
            timer.stop();

            timer.interval = 100;
            timer.start();

            await MockTime.advance(50);
            expect(firedTime).equal(undefined);

            await MockTime.advance(50);
            expect(firedTime).equal(FAKE_TIME + 100);
        });

        it("does not affect a running timer until it restarts", async () => {
            const firedTimes = new Array<number>();

            const timer = MockTime.getTimer("Test", 30, () => firedTimes.push(MockTime.nowMs));
            timer.start();
            timer.interval = 100;

            await MockTime.advance(30);
            expect(firedTimes).deep.equal([FAKE_TIME + 30]);

            timer.start();

            await MockTime.advance(100);
            expect(firedTimes).deep.equal([FAKE_TIME + 30, FAKE_TIME + 130]);
        });

        it("controls the period of a periodic timer from the next start", async () => {
            const firedTimes = new Array<number>();

            const timer = MockTime.getPeriodicTimer("Test periodic", 30, () => firedTimes.push(MockTime.nowMs));
            timer.start();
            timer.interval = 50;

            // The armed period continues to apply while running
            await MockTime.advance(60);
            expect(firedTimes).deep.equal([FAKE_TIME + 30, FAKE_TIME + 60]);

            timer.stop();
            timer.start();

            await MockTime.advance(100);
            expect(firedTimes).deep.equal([FAKE_TIME + 30, FAKE_TIME + 60, FAKE_TIME + 110, FAKE_TIME + 160]);

            timer.stop();
        });

        it("rejects out-of-range values", () => {
            const timer = MockTime.getTimer("Test", 30, () => {});

            expect(() => (timer.interval = -1)).throws("must be between");
            expect(() => (timer.interval = 2_147_483_648)).throws("must be between");
            expect(() => MockTime.getTimer("Test", -1, () => {})).throws("must be between");
            expect(() => MockTime.getPeriodicTimer("Test periodic", 2_147_483_648, () => {})).throws("must be between");

            expect(timer.interval).equal(30);
        });
    });

    describe("advance", () => {
        it("rejects a timer that rearms without advancing time", async () => {
            MockTime.getPeriodicTimer("Spinner", 0, () => {}).start();

            await expect(MockTime.advance(1)).rejectedWith("Spinner");
        });
    });

    describe("isPeriodic", () => {
        it("distinguishes one-shot from periodic timers", () => {
            expect(MockTime.getTimer("Test", 30, () => {}).isPeriodic).equal(false);
            expect(MockTime.getPeriodicTimer("Test periodic", 30, () => {}).isPeriodic).equal(true);
        });
    });

    describe("getTimer", () => {
        it("restarts rather than double-arming when started while running", async () => {
            const firedTimes = new Array<number>();

            const timer = MockTime.getTimer("Test", 30, () => firedTimes.push(MockTime.nowMs));
            timer.start();

            await MockTime.advance(10);
            timer.start();

            await MockTime.advance(100);
            expect(firedTimes).deep.equal([FAKE_TIME + 40]);
        });

        it("returns a timer that will call a callback in the future", async () => {
            let firedTime;

            const result = MockTime.getTimer("Test", 30, () => (firedTime = MockTime.nowMs));
            expect(result.isRunning).equal(false);
            result.start();
            expect(result.isRunning).equal(true);

            expect(firedTime).equal(undefined);

            await MockTime.advance(45);

            expect(firedTime).equal(FAKE_TIME + 30);
            expect(result.isRunning).equal(false);
        });

        it("returns a timer that can be stopped", async () => {
            let firedTime;

            const result = MockTime.getTimer("Test", 30, () => (firedTime = MockTime.nowMs));
            expect(result.isRunning).equal(false);
            result.start();
            expect(result.isRunning).equal(true);
            result.stop();
            expect(result.isRunning).equal(false);

            expect(firedTime).equal(undefined);

            await MockTime.advance(45);

            expect(firedTime).equal(undefined);
            expect(result.isRunning).equal(false);
        });
    });
});
