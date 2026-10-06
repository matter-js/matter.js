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

    describe("stepWallClock", () => {
        it("moves the wall clock without moving the monotonic clock or timers", async () => {
            let firedAt: number | undefined;
            MockTime.getTimer("Test", 30, () => (firedAt = MockTime.nowUs)).start();

            MockTime.stepWallClock(-10_000);
            expect(MockTime.nowMs).equal(FAKE_TIME - 10_000);
            expect(MockTime.now.getTime()).equal(FAKE_TIME - 10_000);
            expect(MockTime.nowUs).equal(FAKE_TIME);

            await MockTime.advance(30);
            expect(firedAt).equal(FAKE_TIME + 30);
            expect(MockTime.nowMs).equal(FAKE_TIME - 10_000 + 30);
        });

        it("schedules a timer started after a step on the monotonic clock", async () => {
            let firedAt: number | undefined;
            MockTime.stepWallClock(10_000);
            MockTime.getTimer("Test", 30, () => (firedAt = MockTime.nowUs)).start();

            await MockTime.advance(30);
            expect(firedAt).equal(FAKE_TIME + 30);
        });

        it("rearms a periodic timer after a step on the monotonic clock", async () => {
            const firedAt = new Array<number>();
            const timer = MockTime.getPeriodicTimer("Test", 30, () => firedAt.push(MockTime.nowUs)).start();
            MockTime.stepWallClock(10_000);

            await MockTime.advance(60);
            timer.stop();
            expect(firedAt).deep.equal([FAKE_TIME + 30, FAKE_TIME + 60]);
        });

        it("leaves atTime reading the requested wall-clock time", () => {
            MockTime.stepWallClock(5000);

            expect(MockTime.atTime(1000, () => MockTime.nowMs)).equal(1000);
            expect(MockTime.nowMs).equal(FAKE_TIME + 5000);
        });

        it("is cleared by reset", () => {
            MockTime.stepWallClock(5000);
            MockTime.reset(FAKE_TIME);

            expect(MockTime.nowMs).equal(FAKE_TIME);
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

        it("rejects negative and infinite values", () => {
            const timer = MockTime.getTimer("Test", 30, () => {});

            expect(() => (timer.interval = -1)).throws("not negative");
            expect(() => (timer.interval = Infinity)).throws("must be finite");
            expect(() => MockTime.getTimer("Test", -1, () => {})).throws("not negative");
            expect(() => MockTime.getPeriodicTimer("Test periodic", Infinity, () => {})).throws("must be finite");

            expect(timer.interval).equal(30);
        });

        it("accepts values beyond the setTimeout maximum", () => {
            const timer = MockTime.getTimer("Test", 2_147_483_648, () => {});
            expect(timer.interval).equal(2_147_483_648);
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

// The two tests depend on running in order: the second observes the per-test state reset after the first
describe("MockTime wall clock step across tests", () => {
    before(() => MockTime.reset(FAKE_TIME));

    it("steps the wall clock", () => {
        MockTime.stepWallClock(5000);

        expect(MockTime.nowMs - MockTime.nowUs).equal(5000);
    });

    it("is cleared by the per-test state reset", () => {
        expect(MockTime.nowMs).equal(MockTime.nowUs);
    });
});
