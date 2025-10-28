/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SafePromise } from "#util/Promises.js";

describe("Promises", () => {
    describe("SafePromise.race", () => {
        it("works with two resolutions", async () => {
            const promise1 = Promise.resolve("foo");
            const promise2 = Promise.resolve("bar");

            expect(await SafePromise.race([promise1, promise2])).equals("foo");
        });

        it("works with partial resolution", async () => {
            const promise1 = new Promise(() => {});
            const promise2 = Promise.resolve("bar");

            expect(await SafePromise.race([promise1, promise2])).equals("bar");
        });

        it("works with eventual partial resolution", async () => {
            const promise1 = new Promise(() => {});

            let resolve!: (str: string) => void;
            const promise2 = new Promise<string>(r => (resolve = r));

            const race = SafePromise.race([promise1, promise2]);

            resolve("foo");

            expect(await race).equals("foo");
        });

        it("works with errors", async () => {
            const promise1 = new Promise(() => {});
            const promise2 = Promise.reject(new Error("oops"));

            expect(SafePromise.race([promise1, promise2])).rejectedWith(Error, "oops");
        });

        it("doesn't register more than one listener", async () => {
            let thens = 0;

            let promise!: PromiseLike<void>;
            let resolve!: () => void;
            const realPromise = new Promise<void>(r => {
                resolve = r;
                promise = {
                    then(resolve, reject) {
                        thens++;
                        return realPromise.then(resolve, reject);
                    },
                };
            });

            // Change this to "Promise.race" and the test will fail due to leak
            const promise1 = SafePromise.race([promise]);
            const promise2 = SafePromise.race([promise, promise]);

            resolve();

            await promise1;
            await promise2;

            expect(thens).equals(1);
        });
    });
});
