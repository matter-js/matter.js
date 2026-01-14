/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { FailsafeTimer } from "#common/FailsafeTimer.js";
import { createPromise, Instant, Seconds } from "#general";

// TODO identify more cases that are not handled by chip tool tests
describe("FailSafeTimer Test", () => {
    before(() => {
        MockTime.enable();
    });

    describe("Verify Expiry handling", () => {
        it("Expiry callback is called when failsafe expires", async () => {
            const { promise, resolver } = createPromise<void>();
            new FailsafeTimer(undefined, Seconds.one, Seconds(100), async () => resolver());

            await MockTime.advance(1000);

            await promise;
        });

        it("Expiry callback is called when failsafe expires after being rearmed (extended)", async () => {
            let expired = false;
            const failSafe = new FailsafeTimer(undefined, Seconds(3), Seconds(100), async () => {
                expired = true;
            });

            await MockTime.advance(1500);
            expect(expired).to.be.false;
            await failSafe.reArm(undefined, Seconds(3));
            expect(expired).to.be.false;
            await MockTime.advance(1500);
            expect(expired).to.be.false;
            await MockTime.advance(1499);
            expect(expired).to.be.false;
            await MockTime.advance(1);
            expect(expired).to.be.true;
        });

        it("Expiry callback is called directly when failsafe expires after being rearmed (with 0)", async () => {
            let expired = false;
            const failSafe = new FailsafeTimer(undefined, Seconds(3), Seconds(100), async () => {
                expired = true;
            });

            await MockTime.advance(1500);
            expect(expired).to.be.false;
            await failSafe.reArm(undefined, Instant);
            expect(expired).to.be.true;
        });

        it("Expiry callback is called when max cumulative failsafe expires", async () => {
            let expired = false;
            const failSafe = new FailsafeTimer(undefined, Seconds(3), Seconds(2), async () => {
                expired = true;
            });

            await MockTime.advance(1500);
            expect(expired).to.be.false;
            await failSafe.reArm(undefined, Seconds.one);
            expect(expired).to.be.false;
            await MockTime.advance(500);
            expect(expired).to.be.true;
        });

        it("Expiry callback is not called when failsafe was completed", async () => {
            let expired = false;
            const failSafe = new FailsafeTimer(undefined, Seconds(3), Seconds(2), async () => {
                expired = true;
            });

            await MockTime.advance(1500);
            expect(expired).to.be.false;
            failSafe.complete();
            expect(expired).to.be.false;
            await MockTime.advance(1500);
            expect(expired).to.be.false;
        });
    });
});
