/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// MockTime lives in @matter/testing, which has no dependencies and no suite of its own, so its tests live here

const FAKE_TIME = 36000000;

const OPERATIONS = 5;

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

/**
 * A stand-in for a host operation such as crypto.  The real thing settles on host time, which would make every
 * assertion about it a measurement of the machine; this settles when the test says so, so the assertions describe
 * MockTime instead.
 */
class FakeHostOperation {
    #settle!: () => void;
    readonly promise: Promise<void>;

    constructor() {
        this.promise = MockTime.requireHostAsync(new Promise<void>(resolve => (this.#settle = resolve)));
    }

    settle() {
        this.#settle();
    }
}

/**
 * Perform host operations back to back, each settling only once the previous one's continuation has resumed.  This is
 * the handover a chain of crypto calls performs, with the host's latency taken out of it.  Settling on the host's task
 * queue rather than in a microtask models the chain a mock transport performs, where the continuation is a task behind
 * the operation that just settled.
 */
async function chainHostOperations(count: number, settleOn: "microtask" | "hostTask" = "microtask") {
    for (let i = 0; i < count; i++) {
        const operation = new FakeHostOperation();
        if (settleOn === "microtask") {
            queueMicrotask(() => operation.settle());
        } else {
            hostTask(() => operation.settle());
        }
        await operation.promise;
    }
}

describe("MockTime.resolve", () => {
    beforeEach(() => MockTime.reset(FAKE_TIME));

    it("holds virtual time while a host operation is pending", async () => {
        const operation = new FakeHostOperation();

        let settled = false;
        hostTask(() => {
            settled = true;
            operation.settle();
        });

        await MockTime.resolve(operation.promise);

        expect(settled).equal(true);
        expect(MockTime.nowMs).equal(FAKE_TIME);
    });

    it("holds virtual time for a chain of host operations", async () => {
        await MockTime.resolve(chainHostOperations(OPERATIONS));

        expect(MockTime.nowMs).equal(FAKE_TIME);
        expect(MockTime.pendingHostAsyncOps).equal(0);
    });

    it("abandons a host operation that does not settle", async () => {
        const stalled = new FakeHostOperation();
        try {
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
        } finally {
            stalled.settle();
        }
    });

    it("spends a bridge left by an earlier wait rather than keeping it", async () => {
        const operation = new FakeHostOperation();
        queueMicrotask(() => operation.settle());
        await MockTime.resolve(operation.promise);

        // The bridge the settled operation left behind expires within the next wait instead of withholding forever
        await MockTime.resolve(
            new Promise<void>(resolve => {
                MockTime.getTimer("Resolver", 5000, resolve).start();
            }),
        );

        expect(MockTime.nowMs).equal(FAKE_TIME + 5000);
        expect(MockTime.dependentCount).equal(0);
    });

    it("lets a timer drive the clock once host work is done", async () => {
        await MockTime.resolve(
            (async () => {
                const operation = new FakeHostOperation();
                queueMicrotask(() => operation.settle());
                await operation.promise;

                await new Promise<void>(resolve => {
                    MockTime.getTimer("Resolver", 5000, resolve).start();
                });
            })(),
        );

        expect(MockTime.nowMs).equal(FAKE_TIME + 5000);
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

    it("registers no host operation when crypto rejects its arguments", async function () {
        if (nodeCrypto?.pbkdf2 === undefined) {
            this.skip();
        }

        expect(() => nodeCrypto.pbkdf2("password", "salt", 1000, 16, "not-a-digest")).throws(Error);

        expect(MockTime.pendingHostAsyncOps).equal(0);
    });
});
