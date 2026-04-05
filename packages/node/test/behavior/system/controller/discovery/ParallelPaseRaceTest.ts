/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CanceledError, MatterAggregateError } from "@matter/general";
import { PeerCommunicationError } from "@matter/protocol";

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
        let winnerAttempt: Promise<unknown> | undefined;
        let winnerExtractor: ((result: unknown) => W | undefined) | undefined;
        let stopped = false;
        const attemptErrors = new Array<Error>();

        function registerAttempt<R>(
            factory: (winOnPase: () => boolean) => R | PromiseLike<R>,
            extractWinner: (result: R) => W | undefined,
        ): void {
            let attempt!: Promise<R | undefined>;
            let isWinner = false;

            const winOnPase = () => {
                if (paseWon) return false;
                paseWon = true;
                isWinner = true;
                stopped = true;
                pending.delete(attempt);
                winnerAttempt = attempt;
                winnerExtractor = extractWinner as (result: unknown) => W | undefined;
                return true;
            };

            attempt = Promise.resolve(factory(winOnPase))
                .catch(error => {
                    if (isWinner) {
                        // Winner's error must propagate
                        throw error;
                    }
                    // Loser: expected race side effect — resolve to prevent unhandled rejection.
                    // Collect non-cancellation errors for the failure message.
                    if (!(error instanceof CanceledError)) {
                        attemptErrors.push(error);
                    }
                    return undefined;
                })
                .finally(() => {
                    pending.delete(attempt);
                });

            pending.add(attempt);
        }

        async function onComplete(): Promise<W> {
            try {
                if (winnerAttempt !== undefined) {
                    winner = winnerExtractor!(await winnerAttempt);
                }
            } finally {
                await MatterAggregateError.allSettled([...pending], "cleanup").catch(() => {});
            }

            if (winner === undefined) {
                if (attemptErrors.length > 0) {
                    throw new MatterAggregateError(attemptErrors, "No winner");
                }
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

    it("collects attempt errors into aggregate error when no winner", async () => {
        const harness = createRaceHarness<string>();
        const gate1 = deferred();
        const gate2 = deferred();

        harness.registerAttempt(
            async () => {
                await gate1.promise;
                throw new PeerCommunicationError("address 1 unreachable");
            },
            result => result,
        );

        harness.registerAttempt(
            async () => {
                await gate2.promise;
                throw new PeerCommunicationError("address 2 unreachable");
            },
            result => result,
        );

        // Both fail
        gate1.resolve();
        gate2.resolve();
        await MockTime.yield3();

        const error = await expect(harness.onComplete()).to.be.rejectedWith(MatterAggregateError);
        expect(error.errors).length(2);
        expect(error.errors[0].message).equals("address 1 unreachable");
        expect(error.errors[1].message).equals("address 2 unreachable");
    });

    it("excludes CanceledError from collected attempt errors", async () => {
        const harness = createRaceHarness<string>();
        const gate1 = deferred();
        const gate2 = deferred();

        harness.registerAttempt(
            async () => {
                await gate1.promise;
                throw new PeerCommunicationError("unreachable");
            },
            result => result,
        );

        harness.registerAttempt(
            async () => {
                await gate2.promise;
                throw new CanceledError("aborted by race");
            },
            result => result,
        );

        gate1.resolve();
        gate2.resolve();
        await MockTime.yield3();

        const error = await expect(harness.onComplete()).to.be.rejectedWith(MatterAggregateError);
        // Only the PeerCommunicationError should be collected, not the CanceledError
        expect(error.errors).length(1);
        expect(error.errors[0].message).equals("unreachable");
    });
});
