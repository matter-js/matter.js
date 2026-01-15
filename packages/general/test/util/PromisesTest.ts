/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Observable, ObservableValue } from "#index.js";
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

        it("works with observables", async () => {
            const observable = new Observable<[boolean]>();

            const done = SafePromise.race([observable]);

            expect(observable.isObserved).true;

            observable.emit(false);

            expect(await done).equals(false);

            expect(observable.isObserved).false;
        });

        it("unbinds observers on resolve", async () => {
            let resolve!: () => void;
            const promise = new Promise<void>(r => (resolve = r));

            const observable = new Observable<[]>();

            const done = SafePromise.race([promise, observable]);

            expect(observable.isObserved).true;

            resolve();

            await done;

            expect(observable.isObserved).false;
        });

        it("works with observable values", async () => {
            const value = new ObservableValue<[boolean]>();

            const done = SafePromise.race([value]);

            expect(value.isObserved).true;

            value.emit(false);

            expect(value.isObserved).true;

            value.emit(true);

            expect(await done).equals(true);

            expect(value.isObserved).false;
        });

        it("handles observable value rejection", async () => {
            const value = new ObservableValue<[boolean]>();

            const done = SafePromise.race([value]);

            value.reject(new Error("oops"));

            await expect(done).rejectedWith(Error, "oops");

            expect(value.isObserved).false;
        });
    });
});
