/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// MockTime lives in @matter/testing, which has no dependencies and no suite of its own, so its tests live here

const FAKE_TIME = 36000000;

const GAPS = 5;

const nodeCrypto = (globalThis as any).process?.getBuiltinModule?.("crypto");

/**
 * Queue work the same way the platform's macrotask does, so these tests cover the browser too.  A real timer is
 * deliberately not used: MockTime bounds a continuation waiting on the task queue, not one waiting on the host clock.
 */
function hostTask(worker: () => void) {
    if (typeof setImmediate === "function") {
        setImmediate(worker);
        return;
    }

    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
        channel.port1.close();
        worker();
    };
    channel.port2.postMessage(undefined);
}

describe("MockTime.resolve", () => {
    beforeEach(() => MockTime.reset(FAKE_TIME));

    it("holds virtual time while host crypto is pending", async () => {
        await MockTime.resolve(
            (async () => {
                for (let i = 0; i < 5; i++) {
                    await crypto.subtle.digest("SHA-256", new Uint8Array([i]));
                }
            })(),
        );

        expect(MockTime.nowMs).equal(FAKE_TIME);
    });

    it("charges no virtual time for a gap between host operations", async () => {
        await MockTime.resolve(
            (async () => {
                for (let i = 0; i < 5; i++) {
                    await crypto.subtle.digest("SHA-256", new Uint8Array([i]));
                    await MockTime.macrotask;
                    await Promise.resolve();
                }
            })(),
        );

        expect(MockTime.nowMs).equal(FAKE_TIME);
        expect(MockTime.pendingHostAsyncOps).equal(0);
    });

    it("spends a bridge left by an earlier wait rather than keeping it", async () => {
        await MockTime.resolve(crypto.subtle.digest("SHA-256", new Uint8Array([1])));

        // The bridge the settled operation left behind expires within the next wait instead of withholding forever
        await MockTime.resolve(
            new Promise<void>(resolve => {
                MockTime.getTimer("Resolver", 5000, resolve).start();
            }),
        );

        expect(MockTime.nowMs).equal(FAKE_TIME + 5000);
        expect(MockTime.dependentCount).equal(0);
    });

    it("keeps the handover bridge intact however many waits overlap", async () => {
        const spin = () =>
            MockTime.resolve(
                (async () => {
                    for (let i = 0; i < 20; i++) {
                        await MockTime.macrotask;
                    }
                })(),
            );

        const overlapping = [spin(), spin()];

        await MockTime.resolve(
            (async () => {
                for (let i = 0; i < GAPS; i++) {
                    await crypto.subtle.digest("SHA-256", new Uint8Array([i]));
                    await MockTime.macrotask;
                    await Promise.resolve();
                }
            })(),
        );

        // Without the bridge each handover costs a step; competing waits may still cost one between them
        expect(MockTime.nowMs - FAKE_TIME).most(100);

        await Promise.all(overlapping);
    });

    it("lets a timer drive the clock once host work is done", async () => {
        await MockTime.resolve(
            (async () => {
                await crypto.subtle.digest("SHA-256", new Uint8Array([1]));
                await new Promise<void>(resolve => {
                    MockTime.getTimer("Resolver", 5000, resolve).start();
                });
            })(),
        );

        expect(MockTime.nowMs).equal(FAKE_TIME + 5000);
    });

    it("bounds what a gap outside MockTime's view can charge", async () => {
        await MockTime.resolve(
            (async () => {
                for (let i = 0; i < GAPS; i++) {
                    await crypto.subtle.digest("SHA-256", new Uint8Array([i]));

                    // a continuation that registers nothing and that draining microtasks cannot reach
                    await new Promise<void>(resolve => hostTask(resolve));
                }
            })(),
        );

        // Such a gap costs at most the steps taken before the loop next visits the host, however slow the host is
        expect(MockTime.nowMs - FAKE_TIME).most(GAPS * MockTime.hostTurnInterval * 100);
    });

    it("visits the host task queue while a timer drives the clock", async () => {
        let hostWorkDone = false;
        hostTask(() => (hostWorkDone = true));

        await MockTime.resolve(
            new Promise<void>(resolve => {
                MockTime.getTimer("Resolver", 10000, resolve).start();
            }),
        );

        expect(hostWorkDone).equal(true);
    });

    it("holds virtual time while a host crypto callback is pending", async function () {
        if (nodeCrypto?.pbkdf2 === undefined) {
            this.skip();
        }

        await MockTime.resolve(
            new Promise<void>((resolve, reject) =>
                nodeCrypto.pbkdf2("password", "salt", 1000, 16, "sha256", (cause: Error | null) =>
                    cause ? reject(cause) : resolve(),
                ),
            ),
        );

        expect(MockTime.nowMs).equal(FAKE_TIME);
    });

    it("abandons a host operation that does not settle", async () => {
        let settleStalledOp!: () => void;
        try {
            void MockTime.requireHostAsync(new Promise<void>(resolve => (settleStalledOp = resolve)));

            let fired = false;
            MockTime.getTimer("Test", 100, () => (fired = true)).start();

            await MockTime.resolve(
                new Promise<void>(resolve => {
                    MockTime.getTimer("Resolver", 100, resolve).start();
                }),
            );

            expect(fired).equal(true);
            expect(MockTime.pendingHostAsyncOps).equal(0);
            expect(MockTime.abandonedHostAsyncOps).equal(1);

            // An abandoned operation may never settle, so the next test must not inherit it
            expect(MockTime.dependentCount).least(1);
            MockTime.reset(FAKE_TIME);
            expect(MockTime.dependentCount).equal(0);
        } finally {
            settleStalledOp?.();
        }
    });

    it("charges each host operation its own budget", async () => {
        let settleStalledOp!: () => void;
        try {
            void MockTime.requireHostAsync(new Promise<void>(resolve => (settleStalledOp = resolve)));

            await MockTime.resolve(
                (async () => {
                    for (let i = 0; i < 5; i++) {
                        await crypto.subtle.digest("SHA-256", new Uint8Array([i]));
                    }
                })(),
            );

            expect(MockTime.nowMs - FAKE_TIME).most(500);
        } finally {
            settleStalledOp?.();
        }
    });

    it("charges one yield per turn however many waits overlap", async () => {
        let settleStalledOp!: () => void;
        try {
            void MockTime.requireHostAsync(new Promise<void>(resolve => (settleStalledOp = resolve)));

            const turns = () =>
                (async () => {
                    for (let i = 0; i < 5; i++) {
                        await MockTime.macrotask;
                    }
                })();

            await Promise.all([MockTime.resolve(turns()), MockTime.resolve(turns()), MockTime.resolve(turns())]);

            // Three waits spinning over the same five turns charge those five turns once, not once per wait
            expect(MockTime.hostAsyncYieldsCharged).most(8);
        } finally {
            settleStalledOp?.();
        }
    });

    it("stops waiting on macrotasks for a host operation that does not settle", async () => {
        let settleStalledOp!: () => void;
        try {
            void MockTime.requireHostAsync(new Promise<void>(resolve => (settleStalledOp = resolve)));

            await MockTime.macrotasks;

            expect(MockTime.pendingHostAsyncOps).equal(0);
        } finally {
            settleStalledOp?.();
        }
    });

    it("registers no host operation when crypto rejects its arguments", async function () {
        if (nodeCrypto?.pbkdf2 === undefined) {
            this.skip();
        }

        expect(() => nodeCrypto.pbkdf2("password", "salt", 1000, 16, "not-a-digest")).throws(Error);

        expect(MockTime.pendingHostAsyncOps).equal(0);
    });
});
