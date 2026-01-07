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

    describe("getTimer", () => {
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
