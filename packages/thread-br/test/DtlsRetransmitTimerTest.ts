/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    type DtlsClearTimeoutFn,
    DtlsRetransmitTimer,
    type DtlsRetransmitTimerHandle,
    type DtlsSetTimeoutFn,
} from "../src/dtls/socket/DtlsRetransmitTimer.js";

interface PendingTimer {
    delay: number;
    cb: () => void;
    handle: DtlsRetransmitTimerHandle;
    cancelled: boolean;
}

class FakeClock {
    readonly pending = new Array<PendingTimer>();
    #nextId = 1;

    readonly setTimeoutImpl: DtlsSetTimeoutFn = (cb, delay) => {
        const id = this.#nextId++;
        const handle = { _opaque: id };
        this.pending.push({ delay, cb, handle, cancelled: false });
        return handle;
    };

    readonly clearTimeoutImpl: DtlsClearTimeoutFn = handle => {
        const idx = this.pending.findIndex(p => p.handle === handle);
        if (idx >= 0) {
            this.pending[idx].cancelled = true;
        }
    };

    /** Fire the most-recently-armed (single) pending timer. */
    fireOne(): { delay: number } {
        const idx = this.pending.findIndex(p => !p.cancelled);
        if (idx < 0) {
            throw new Error("FakeClock.fireOne: no active timers");
        }
        const t = this.pending[idx];
        this.pending.splice(idx, 1);
        t.cb();
        return { delay: t.delay };
    }

    activeCount(): number {
        return this.pending.filter(p => !p.cancelled).length;
    }
}

describe("DtlsRetransmitTimer — RFC 6347 §4.2.4 doubling", () => {
    it("fires onRetransmit at initialMs, doubling each attempt up to maxMs", () => {
        const clock = new FakeClock();
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
            setTimeoutImpl: clock.setTimeoutImpl,
            clearTimeoutImpl: clock.clearTimeoutImpl,
        });
        timer.armNewFlight();
        expect(timer.isArmed()).to.equal(true);

        const delays = new Array<number>();
        delays.push(clock.fireOne().delay);
        delays.push(clock.fireOne().delay);
        delays.push(clock.fireOne().delay);
        delays.push(clock.fireOne().delay);
        delays.push(clock.fireOne().delay);
        expect(delays).to.deep.equal([1000, 2000, 4000, 8000, 16_000]);
        expect(fired.length).to.equal(5);
        expect(gaveUp).to.equal(false);

        // The 6th fire (still scheduled at 32_000ms) trips give-up.
        const giveUpDelay = clock.fireOne().delay;
        expect(giveUpDelay).to.equal(32_000);
        expect(gaveUp).to.equal(true);
        expect(fired.length).to.equal(5);
    });

    it("caps the doubling at maxMs", () => {
        const clock = new FakeClock();
        const fired = new Array<number>();
        const timer = new DtlsRetransmitTimer({
            initialMs: 1000,
            maxMs: 5000,
            maxRetransmits: 6,
            onRetransmit: () => fired.push(1),
            onGiveUp: () => {},
            setTimeoutImpl: clock.setTimeoutImpl,
            clearTimeoutImpl: clock.clearTimeoutImpl,
        });
        timer.armNewFlight();
        const delays = new Array<number>();
        for (let i = 0; i < 6; i++) {
            delays.push(clock.fireOne().delay);
        }
        // 1000, 2000, 4000, then capped at 5000, 5000, 5000.
        expect(delays).to.deep.equal([1000, 2000, 4000, 5000, 5000, 5000]);
    });

    it("cancel() prevents the next firing", () => {
        const clock = new FakeClock();
        let fired = 0;
        const timer = new DtlsRetransmitTimer({
            initialMs: 1000,
            maxMs: 60_000,
            maxRetransmits: 5,
            onRetransmit: () => {
                fired += 1;
            },
            onGiveUp: () => {},
            setTimeoutImpl: clock.setTimeoutImpl,
            clearTimeoutImpl: clock.clearTimeoutImpl,
        });
        timer.armNewFlight();
        expect(timer.isArmed()).to.equal(true);
        timer.cancel();
        expect(timer.isArmed()).to.equal(false);
        expect(clock.activeCount()).to.equal(0);
        expect(fired).to.equal(0);
    });

    it("armNewFlight() resets attempt counter and delay", () => {
        const clock = new FakeClock();
        const timer = new DtlsRetransmitTimer({
            initialMs: 1000,
            maxMs: 60_000,
            maxRetransmits: 5,
            onRetransmit: () => {},
            onGiveUp: () => {},
            setTimeoutImpl: clock.setTimeoutImpl,
            clearTimeoutImpl: clock.clearTimeoutImpl,
        });
        timer.armNewFlight();
        clock.fireOne(); // 1000
        clock.fireOne(); // 2000
        expect(timer.attempt).to.equal(2);

        // Re-arm: attempt resets to 0, next delay should be 1000 again.
        timer.armNewFlight();
        expect(timer.attempt).to.equal(0);
        const next = clock.fireOne();
        expect(next.delay).to.equal(1000);
    });

    it("calling armNewFlight() while armed cancels the prior timer", () => {
        const clock = new FakeClock();
        let fired = 0;
        const timer = new DtlsRetransmitTimer({
            initialMs: 1000,
            maxMs: 60_000,
            maxRetransmits: 5,
            onRetransmit: () => {
                fired += 1;
            },
            onGiveUp: () => {},
            setTimeoutImpl: clock.setTimeoutImpl,
            clearTimeoutImpl: clock.clearTimeoutImpl,
        });
        timer.armNewFlight();
        timer.armNewFlight();
        expect(clock.activeCount()).to.equal(1);
        clock.fireOne();
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
