/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DtlsRetransmitTimer } from "../src/dtls/socket/DtlsRetransmitTimer.js";

describe("DtlsRetransmitTimer — RFC 6347 §4.2.4 doubling", () => {
    before(MockTime.enable);

    it("fires onRetransmit at initialMs, doubling each attempt up to maxMs", async () => {
        const fired = new Array<number>();
        let gaveUp = false;
        const timer = new DtlsRetransmitTimer({
            initialMs: 1000,
            maxMs: 60_000,
            maxRetransmits: 5,
            onRetransmit: () => fired.push(1),
            onGiveUp: () => {
                gaveUp = true;
            },
        });
        timer.armNewFlight();
        expect(timer.isArmed()).to.equal(true);

        // Fire retransmit #1 at 1000ms.
        await MockTime.advance(1000);
        expect(fired.length).to.equal(1);
        expect(timer.attempt).to.equal(1);

        // Fire retransmit #2 at 2000ms.
        await MockTime.advance(2000);
        expect(fired.length).to.equal(2);
        expect(timer.attempt).to.equal(2);

        // Fire retransmit #3 at 4000ms.
        await MockTime.advance(4000);
        expect(fired.length).to.equal(3);
        expect(timer.attempt).to.equal(3);

        // Fire retransmit #4 at 8000ms.
        await MockTime.advance(8000);
        expect(fired.length).to.equal(4);
        expect(timer.attempt).to.equal(4);

        // Fire retransmit #5 at 16000ms.
        await MockTime.advance(16_000);
        expect(fired.length).to.equal(5);
        expect(timer.attempt).to.equal(5);
        expect(gaveUp).to.equal(false);

        // The 6th fire (at 32000ms) trips give-up.
        await MockTime.advance(32_000);
        expect(gaveUp).to.equal(true);
        expect(fired.length).to.equal(5);
    });

    it("caps the doubling at maxMs", async () => {
        const fired = new Array<number>();
        const timer = new DtlsRetransmitTimer({
            initialMs: 1000,
            maxMs: 5000,
            maxRetransmits: 6,
            onRetransmit: () => fired.push(1),
            onGiveUp: () => {},
        });
        timer.armNewFlight();

        // 1000, 2000, 4000, then capped at 5000, 5000, 5000.
        await MockTime.advance(1000);
        expect(fired.length).to.equal(1);
        await MockTime.advance(2000);
        expect(fired.length).to.equal(2);
        await MockTime.advance(4000);
        expect(fired.length).to.equal(3);
        await MockTime.advance(5000);
        expect(fired.length).to.equal(4);
        await MockTime.advance(5000);
        expect(fired.length).to.equal(5);
        await MockTime.advance(5000);
        expect(fired.length).to.equal(6);
    });

    it("cancel() prevents the next firing", async () => {
        let fired = 0;
        const timer = new DtlsRetransmitTimer({
            initialMs: 1000,
            maxMs: 60_000,
            maxRetransmits: 5,
            onRetransmit: () => {
                fired += 1;
            },
            onGiveUp: () => {},
        });
        timer.armNewFlight();
        expect(timer.isArmed()).to.equal(true);
        timer.cancel();
        expect(timer.isArmed()).to.equal(false);
        await MockTime.advance(1000);
        expect(fired).to.equal(0);
    });

    it("armNewFlight() resets attempt counter and delay", async () => {
        const timer = new DtlsRetransmitTimer({
            initialMs: 1000,
            maxMs: 60_000,
            maxRetransmits: 5,
            onRetransmit: () => {},
            onGiveUp: () => {},
        });
        timer.armNewFlight();
        await MockTime.advance(1000); // attempt 1
        await MockTime.advance(2000); // attempt 2
        expect(timer.attempt).to.equal(2);

        // Re-arm: attempt resets to 0, next delay should be 1000 again.
        timer.armNewFlight();
        expect(timer.attempt).to.equal(0);
        await MockTime.advance(1000);
        expect(timer.attempt).to.equal(1);
    });

    it("calling armNewFlight() while armed cancels the prior timer", async () => {
        let fired = 0;
        const timer = new DtlsRetransmitTimer({
            initialMs: 1000,
            maxMs: 60_000,
            maxRetransmits: 5,
            onRetransmit: () => {
                fired += 1;
            },
            onGiveUp: () => {},
        });
        timer.armNewFlight();
        timer.armNewFlight();
        await MockTime.advance(1000);
        expect(fired).to.equal(1);
    });

    it("rejects pathological config", () => {
        expect(
            () =>
                new DtlsRetransmitTimer({
                    initialMs: 0,
                    maxMs: 1,
                    maxRetransmits: 1,
                    onRetransmit: () => {},
                    onGiveUp: () => {},
                }),
        ).to.throw(/initialMs/);
        expect(
            () =>
                new DtlsRetransmitTimer({
                    initialMs: 1000,
                    maxMs: 500,
                    maxRetransmits: 1,
                    onRetransmit: () => {},
                    onGiveUp: () => {},
                }),
        ).to.throw(/maxMs/);
        expect(
            () =>
                new DtlsRetransmitTimer({
                    initialMs: 1000,
                    maxMs: 60_000,
                    maxRetransmits: 0,
                    onRetransmit: () => {},
                    onGiveUp: () => {},
                }),
        ).to.throw(/maxRetransmits/);
    });
});
