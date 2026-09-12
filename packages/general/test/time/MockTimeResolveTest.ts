/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

const FAKE_TIME = 36000000;

const nodeCrypto = (globalThis as any).process?.getBuiltinModule?.("crypto");

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

    it("charges at most one step for a gap between host operations", async () => {
        await MockTime.resolve(
            (async () => {
                for (let i = 0; i < 5; i++) {
                    await crypto.subtle.digest("SHA-256", new Uint8Array([i]));
                    await MockTime.macrotask;
                    await Promise.resolve();
                }
            })(),
        );

        expect(MockTime.nowMs - FAKE_TIME).most(500);
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
