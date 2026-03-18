/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterAggregateError } from "@matter/general";

/**
 * Tests the promise race pattern used by {@link ParallelPaseDiscovery.registerAttempt} and
 * {@link ParallelPaseDiscovery.onComplete}.
 *
 * ParallelPaseDiscovery itself cannot be unit-tested without a full ServerNode/Discovery stack, so we
 * replicate its exact promise handling here to verify that losing attempts do not produce unhandled
 * rejections (which crash the Node.js process — see matterjs-server#394).
 */
describe("ParallelPaseDiscovery race pattern", () => {
    /**
     * Mimics ParallelPaseDiscovery's registerAttempt + onComplete logic (with the catch fix from #394).
     */
    function createRaceHarness<W>() {
        let paseWon = false;
        const pending = new Set<Promise<unknown>>();
        let winner: W | undefined;
        let winnerPromise: Promise<unknown> | undefined;
        let stopped = false;

        function registerAttempt<R>(
            factory: (winOnPase: () => boolean) => R | PromiseLike<R>,
            extractWinner: (result: R) => W | undefined,
        ): void {
            let attempt!: Promise<R>;

            const winOnPase = () => {
                if (paseWon) return false;
                paseWon = true;
                stopped = true;
                pending.delete(attempt);
                winnerPromise = attempt.then(result => {
                    winner = extractWinner(result);
                });
                void winnerPromise.catch(() => {});
                return true;
            };

            attempt = Promise.resolve(factory(winOnPase)).finally(() => {
                pending.delete(attempt);
            });

            void attempt.catch(() => {});

            pending.add(attempt);
        }

        async function onComplete(): Promise<W> {
            try {
                await winnerPromise;
            } finally {
                await MatterAggregateError.allSettled([...pending], "cleanup").catch(() => {});
            }

            if (winner === undefined) {
                throw new Error("No winner");
            }

            return winner;
        }

        return { registerAttempt, onComplete, isStopped: () => stopped };
    }

    /**
     * Collects unhandled rejections during a test. Works in Node.js (process event) and browsers
     * (global event). Returns a dispose function that unregisters and returns collected rejections.
     */
    function trackUnhandledRejections(): { collected: unknown[]; dispose: () => unknown[] } {
        const collected: unknown[] = [];

        if (typeof process !== "undefined" && typeof process.on === "function") {
            const handler = (reason: unknown) => collected.push(reason);
            process.on("unhandledRejection", handler);
            return {
                collected,
                dispose: () => {
                    process.removeListener("unhandledRejection", handler);
                    return collected;
                },
            };
        }

        if (typeof globalThis.addEventListener === "function") {
            const handler = (event: Event) => {
                collected.push((event as PromiseRejectionEvent).reason);
                event.preventDefault();
            };
            globalThis.addEventListener("unhandledrejection", handler);
            return {
                collected,
                dispose: () => {
                    globalThis.removeEventListener("unhandledrejection", handler);
                    return collected;
                },
            };
        }

        return { collected, dispose: () => collected };
    }

    /** Creates a deferred promise for deterministic sequencing. */
    function deferred<T = void>() {
        let resolve!: (value: T) => void;
        let reject!: (reason?: unknown) => void;
        const promise = new Promise<T>((res, rej) => {
            resolve = res;
            reject = rej;
        });
        return { promise, resolve, reject };
    }

    // Note: a "WITHOUT fix" test is intentionally absent — the unhandled rejection it would
    // produce crashes the test runner (which IS the bug).  The crash was verified manually:
    //   git stash -- ParallelPaseDiscovery.ts && npm test --fgrep "ParallelPaseDiscovery"
    // produces: "Caused by: loser: aborted" unhandled rejection → exit code 1.

    it("losing attempt rejection is handled, no unhandled rejection", async () => {
        const tracker = trackUnhandledRejections();

        try {
            const harness = createRaceHarness<string>();

            const winnerPase = deferred();
            const winnerCommissioning = deferred();
            const loserGate = deferred();

            // Winner
            harness.registerAttempt(
                async winOnPase => {
                    await winnerPase.promise;
                    winOnPase();
                    await winnerCommissioning.promise;
                    return "winner-result";
                },
                result => result,
            );

            // Loser
            harness.registerAttempt(
                async () => {
                    await loserGate.promise;
                    throw new Error("loser: aborted");
                },
                result => result,
            );

            // Step 1: Winner wins PASE
            winnerPase.resolve();
            await MockTime.yield();

            // Step 2: Loser fails
            loserGate.resolve();
            await MockTime.yield();

            // Step 3: Winner finishes
            winnerCommissioning.resolve();
            await MockTime.yield();

            const result = await harness.onComplete();
            expect(result).equals("winner-result");

            // Allow microtasks to settle
            await MockTime.yield3();

            // With the fix, no unhandled rejections should occur.
            expect(tracker.collected).deep.equals([]);
        } finally {
            tracker.dispose();
        }
    });

    it("WITH fix: winner error propagates through onComplete even with catch guard", async () => {
        const harness = createRaceHarness<string>();

        const winnerPase = deferred();

        // Winner that fails during "commissioning"
        harness.registerAttempt(
            async winOnPase => {
                await winnerPase.promise;
                winOnPase();
                throw new Error("commissioning failed");
            },
            result => result,
        );

        winnerPase.resolve();
        await MockTime.yield3();

        // The winner's error must still propagate through onComplete.
        await expect(harness.onComplete()).rejectedWith("commissioning failed");
    });

    it("WITH fix: multiple losers all handled cleanly", async () => {
        const tracker = trackUnhandledRejections();

        try {
            const harness = createRaceHarness<string>();

            const winnerPase = deferred();
            const winnerCommissioning = deferred();
            const loserGates = [deferred(), deferred(), deferred()];

            // Winner
            harness.registerAttempt(
                async winOnPase => {
                    await winnerPase.promise;
                    winOnPase();
                    await winnerCommissioning.promise;
                    return "winner";
                },
                result => result,
            );

            // Three losers
            for (let i = 0; i < 3; i++) {
                const gate = loserGates[i];
                harness.registerAttempt(
                    async () => {
                        await gate.promise;
                        throw new Error(`loser-${i}: aborted`);
                    },
                    result => result,
                );
            }

            // Winner wins PASE
            winnerPase.resolve();
            await MockTime.yield();

            // All losers fail
            for (const gate of loserGates) {
                gate.resolve();
            }
            await MockTime.yield();

            // Winner finishes
            winnerCommissioning.resolve();
            await MockTime.yield();

            const result = await harness.onComplete();
            expect(result).equals("winner");

            await MockTime.yield3();
            expect(tracker.collected).deep.equals([]);
        } finally {
            tracker.dispose();
        }
    });
});
