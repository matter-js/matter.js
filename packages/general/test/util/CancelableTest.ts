/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CanceledError } from "#MatterError.js";
import { CancelablePromise } from "#util/Cancelable.js";

describe("CancelablePromise", () => {
    it("resolves like a normal promise", async () => {
        const promise = new CancelablePromise<number>(resolve => resolve(42));

        expect(await promise).equal(42);
    });

    it("rejects like a normal promise", async () => {
        const promise = new CancelablePromise<number>((_resolve, reject) => reject(new Error("nope")));

        await expect(promise).rejectedWith(Error, "nope");
    });

    it("rejects with CanceledError on cancel by default", async () => {
        const promise = new CancelablePromise<number>(() => {});

        promise.cancel();

        await expect(promise).rejectedWith(CanceledError);
    });

    it("cancels with a custom reason", async () => {
        const promise = new CancelablePromise<number>(() => {});

        promise.cancel(new Error("custom reason"));

        await expect(promise).rejectedWith(Error, "custom reason");
    });

    it("ignores cancel after settle", async () => {
        const promise = new CancelablePromise<number>(resolve => resolve(1));
        await promise;

        promise.cancel();

        expect(await promise).equal(1);
    });

    it("runs a custom onCancel handler", async () => {
        let canceledWith: Error | undefined;
        const promise = new CancelablePromise<number>(
            () => {},
            reason => {
                canceledWith = reason;
            },
        );

        promise.cancel(new Error("stop"));

        expect(canceledWith?.message).equal("stop");
    });

    describe("is", () => {
        it("recognizes cancelable promises", () => {
            expect(CancelablePromise.is(new CancelablePromise(resolve => resolve(undefined)))).equal(true);
        });

        it("rejects plain promises and non-promises", () => {
            expect(CancelablePromise.is(Promise.resolve())).equal(false);
            expect(CancelablePromise.is(5)).equal(false);
        });
    });

    describe("static resolve/reject", () => {
        it("resolve produces a settled value with a no-op cancel", async () => {
            const promise = CancelablePromise.resolve(7);

            expect(await promise).equal(7);
            expect(() => promise.cancel("x")).not.throws();
        });

        it("reject produces a rejected promise", async () => {
            await expect(CancelablePromise.reject(new Error("boom"))).rejectedWith(Error, "boom");
        });
    });
});
