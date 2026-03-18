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
     * Mimics ParallelPaseDiscovery's registerAttempt + onComplete logic.
     *
     * @param withCatchFix  When true, applies `void attempt.catch(() => {})` — the fix for #394.
     */
    function createRaceHarness<W>(withCatchFix: boolean) {
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
                if (withCatchFix) {
                    void winnerPromise.catch(() => {});
                }
                return true;
            };

            attempt = Promise.resolve(factory(winOnPase)).finally(() => {
                pending.delete(attempt);
            });

            if (withCatchFix) {
                void attempt.catch(() => {});
            }

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
                event.preventDefault(); // prevent default logging
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

    it("WITHOUT fix: losing attempt produces unhandled rejection when winner completes first", async () => {
        const tracker = trackUnhandledRejections();

        try {
            const harness = createRaceHarness<string>(false /* no fix */);

            // Winner: calls winOnPase during "PASE", then resolves after a short "commissioning" phase.
            harness.registerAttempt(async winOnPase => {
                // Simulate PASE establishment
                await new Promise(r => setTimeout(r, 10));
                winOnPase();
                // Simulate commissioning
                await new Promise(r => setTimeout(r, 50));
                return "winner-result";
            }, result => result);

            // Loser: takes longer, then rejects (simulating abort-induced failure).
            harness.registerAttempt(async () => {
                await new Promise(r => setTimeout(r, 30));
                throw new Error("loser: aborted");
            }, result => result);

            // Wait for the winner to win PASE + complete commissioning, then run onComplete.
            await new Promise(r => setTimeout(r, 80));
            const result = await harness.onComplete();
            expect(result).equals("winner-result");

            // Give the event loop time to fire the unhandledRejection event for the loser.
            await new Promise(r => setTimeout(r, 50));

            // Without the fix, the loser's rejection escapes because .finally() removes it from
            // pending before onComplete's allSettled can catch it.
            expect(tracker.collected.length).greaterThanOrEqual(1);
        } finally {
            tracker.dispose();
        }
    });

    it("WITH fix: losing attempt rejection is handled, no unhandled rejection", async () => {
        const tracker = trackUnhandledRejections();

        try {
            const harness = createRaceHarness<string>(true /* with fix */);

            // Winner
            harness.registerAttempt(async winOnPase => {
                await new Promise(r => setTimeout(r, 10));
                winOnPase();
                await new Promise(r => setTimeout(r, 50));
                return "winner-result";
            }, result => result);

            // Loser
            harness.registerAttempt(async () => {
                await new Promise(r => setTimeout(r, 30));
                throw new Error("loser: aborted");
            }, result => result);

            await new Promise(r => setTimeout(r, 80));
            const result = await harness.onComplete();
            expect(result).equals("winner-result");

            // Give time for any unhandled rejection to fire.
            await new Promise(r => setTimeout(r, 50));

            // With the fix, no unhandled rejections should occur.
            expect(tracker.collected).deep.equals([]);
        } finally {
            tracker.dispose();
        }
    });

    it("WITH fix: winner error propagates through onComplete even with catch guard", async () => {
        const harness = createRaceHarness<string>(true /* with fix */);

        // Winner that fails during "commissioning"
        harness.registerAttempt(async winOnPase => {
            await new Promise(r => setTimeout(r, 10));
            winOnPase();
            // Commissioning fails
            throw new Error("commissioning failed");
        }, result => result);

        await new Promise(r => setTimeout(r, 30));

        // The winner's error must still propagate through onComplete.
        await expect(harness.onComplete()).rejectedWith("commissioning failed");
    });

    it("WITH fix: multiple losers all handled cleanly", async () => {
        const tracker = trackUnhandledRejections();

        try {
            const harness = createRaceHarness<string>(true /* with fix */);

            // Winner
            harness.registerAttempt(async winOnPase => {
                await new Promise(r => setTimeout(r, 10));
                winOnPase();
                await new Promise(r => setTimeout(r, 20));
                return "winner";
            }, result => result);

            // Three losers at different timings
            for (let i = 0; i < 3; i++) {
                const delay = 20 + i * 10;
                harness.registerAttempt(async () => {
                    await new Promise(r => setTimeout(r, delay));
                    throw new Error(`loser-${i}: aborted`);
                }, result => result);
            }

            await new Promise(r => setTimeout(r, 100));
            const result = await harness.onComplete();
            expect(result).equals("winner");

            await new Promise(r => setTimeout(r, 50));
            expect(tracker.collected).deep.equals([]);
        } finally {
            tracker.dispose();
        }
    });
});
