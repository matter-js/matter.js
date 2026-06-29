/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExtPanIdLockManager } from "../src/selection/withExtPanIdLock.js";

const EXT_PAN_A = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]);
const EXT_PAN_B = new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11]);

function defer<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (err: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (err: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

// Read the manager's queue size via a synthetic key probe — we can't reach the private map
// directly, so we rely on `withLock` returning a fresh chain when no entry is registered.
// This holder simply waits one microtask to let any pending `.finally` cleanups settle.
async function microtaskFlush(): Promise<void> {
    for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe("ExtPanIdLockManager", () => {
    it("serialises two calls for the same extPanId", async () => {
        const manager = new ExtPanIdLockManager();
        const order = new Array<string>();
        const gate = defer<void>();

        const first = manager.withLock(EXT_PAN_A, async () => {
            order.push("A-start");
            await gate.promise;
            order.push("A-end");
        });
        const second = manager.withLock(EXT_PAN_A, async () => {
            order.push("B-start");
            order.push("B-end");
        });

        await microtaskFlush();
        expect(order).to.deep.equal(["A-start"]);

        gate.resolve();
        await first;
        await second;
        expect(order).to.deep.equal(["A-start", "A-end", "B-start", "B-end"]);
    });

    it("runs calls for different extPanIds concurrently", async () => {
        const manager = new ExtPanIdLockManager();
        const order = new Array<string>();
        const gateA = defer<void>();
        const gateB = defer<void>();

        const a = manager.withLock(EXT_PAN_A, async () => {
            order.push("A-start");
            await gateA.promise;
            order.push("A-end");
        });
        const b = manager.withLock(EXT_PAN_B, async () => {
            order.push("B-start");
            await gateB.promise;
            order.push("B-end");
        });

        await microtaskFlush();
        // Both have started before either finishes.
        expect(order).to.deep.equal(["A-start", "B-start"]);

        gateB.resolve();
        gateA.resolve();
        await Promise.all([a, b]);
        expect(order).to.include("A-end");
        expect(order).to.include("B-end");
    });

    it("propagates errors from fn to the caller", async () => {
        const manager = new ExtPanIdLockManager();
        const err = new Error("boom");

        let caught: unknown;
        try {
            await manager.withLock(EXT_PAN_A, async () => {
                throw err;
            });
        } catch (e) {
            caught = e;
        }
        expect(caught).to.equal(err);
    });

    it("does not poison the queue: next caller still runs after a failing fn", async () => {
        const manager = new ExtPanIdLockManager();
        const failing = manager.withLock(EXT_PAN_A, async () => {
            throw new Error("boom");
        });
        // Swallow the rejection on the failing promise.
        failing.catch(() => undefined);

        const result = await manager.withLock(EXT_PAN_A, async () => 42);
        expect(result).to.equal(42);
    });

    it("releases the queue entry once all callers complete (no leak)", async () => {
        const manager = new ExtPanIdLockManager();

        await manager.withLock(EXT_PAN_A, async () => 1);
        await manager.withLock(EXT_PAN_A, async () => 2);
        await microtaskFlush();

        // After draining: a brand-new caller's promise must not depend on any prior chain.
        // Probe by running a 100ms synchronous-ish chain and confirming it starts immediately.
        const order = new Array<string>();
        order.push("before");
        const promise = manager.withLock(EXT_PAN_A, async () => {
            order.push("inside");
        });
        await microtaskFlush();
        // Should already have entered the body — if the prior chain were still pinned, this would lag.
        expect(order).to.deep.equal(["before", "inside"]);
        await promise;
    });

    it("runs 100 sequential same-key calls in submission order", async () => {
        const manager = new ExtPanIdLockManager();
        const order = new Array<number>();
        const promises = new Array<Promise<void>>();

        for (let i = 0; i < 100; i++) {
            promises.push(
                manager.withLock(EXT_PAN_A, async () => {
                    order.push(i);
                }),
            );
        }
        await Promise.all(promises);

        expect(order).to.have.lengthOf(100);
        for (let i = 0; i < 100; i++) {
            expect(order[i]).to.equal(i);
        }
    });
});
