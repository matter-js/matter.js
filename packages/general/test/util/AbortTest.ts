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
    });
});
