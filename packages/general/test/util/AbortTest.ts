/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Abort } from "#util/Abort.js";

describe("Abort", () => {
    describe("Abort.race", () => {
        it("returns undefined immediately when signal is already aborted", async () => {
            const abort = new Abort();
            abort.abort();

            // A promise that never resolves — if race doesn't guard the already-aborted
            // signal, this test hangs forever (the Bug 2 regression)
            const never = new Promise<string>(() => {});

            const result = await Abort.race(abort, never);

            expect(result).undefined;
        });

        it("returns undefined when signal aborts before promise resolves", async () => {
            const abort = new Abort();

            let resolve!: (v: string) => void;
            const later = new Promise<string>(r => (resolve = r));

            const race = Abort.race(abort, later);
            abort.abort();

            expect(await race).undefined;

            // Clean up — resolve the dangling promise
            resolve("done");
        });

        it("returns promise value when signal is not aborted", async () => {
            const abort = new Abort();
            try {
                const result = await Abort.race(abort, Promise.resolve("ok"));
                expect(result).equals("ok");
            } finally {
                abort.close();
            }
        });

        it("returns promise value when no signal is provided", async () => {
            const result = await Abort.race(undefined, Promise.resolve("ok"));
            expect(result).equals("ok");
        });

        it("suppresses rejection of abandoned promise when signal is already aborted", async () => {
            const abort = new Abort();
            abort.abort();

            // Simulate the crash scenario: a promise that will reject AFTER race returns
            let reject!: (reason: Error) => void;
            const willReject = new Promise<string>((_resolve, _reject) => (reject = _reject));

            const result = await Abort.race(abort, willReject);
            expect(result).undefined;

            // Reject the abandoned promise — without the fix this would be an unhandled rejection
            reject(new Error("exchange teardown"));

            // Give microtasks a chance to process the rejection
            await new Promise<void>(resolve => setTimeout(resolve, 10));
        });

        it("suppresses rejection of already-rejected promise when signal is already aborted", async () => {
            const abort = new Abort();
            abort.abort();

            const alreadyRejected = Promise.reject(new Error("already failed"));

            const result = await Abort.race(abort, alreadyRejected);
            expect(result).undefined;

            // Give microtasks a chance to process
            await new Promise<void>(resolve => setTimeout(resolve, 10));
        });
    });

    describe("Abort.attempt", () => {
        it("throws AbortedError when signal is already aborted", async () => {
            const abort = new Abort();
            abort.abort();

            let reject!: (reason: Error) => void;
            const willReject = new Promise<string>((_resolve, _reject) => (reject = _reject));

            // attempt should throw because signal is aborted
            await expect(Abort.attempt(abort, willReject)).rejectedWith("Operation aborted");

            // Reject the abandoned promise — must not cause unhandled rejection
            reject(new Error("exchange teardown"));

            await new Promise<void>(resolve => setTimeout(resolve, 10));
        });
    });
});
