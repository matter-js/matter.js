/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BasicMultiplex } from "#util/Multiplex.js";
import { createPromise } from "#util/Promises.js";

describe("BasicMultiplex", () => {
    it("closes once all workers settle", async () => {
        const multiplex = new BasicMultiplex();
        const { promise, resolver } = createPromise<void>();

        let closed = false;
        multiplex.add(promise);
        const closing = multiplex.close().then(() => (closed = true));

        expect(closed).equal(false);
        resolver();
        await closing;
        expect(closed).equal(true);
    });

    it("is awaitable as a PromiseLike", async () => {
        const multiplex = new BasicMultiplex();
        multiplex.add(Promise.resolve());

        await multiplex;
    });

    it("swallows worker rejections", async () => {
        const multiplex = new BasicMultiplex();
        multiplex.add(Promise.reject(new Error("boom")), "failing worker");

        await multiplex.close();
    });

    it("ignores non-promise input", async () => {
        const multiplex = new BasicMultiplex();
        multiplex.add(undefined);

        await multiplex.close();
    });

    it("supports asyncDispose", async () => {
        const multiplex = new BasicMultiplex();
        multiplex.add(Promise.resolve());

        await multiplex[Symbol.asyncDispose]();
    });
});
