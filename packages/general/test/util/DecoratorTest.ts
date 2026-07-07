/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Decorator } from "#util/Decorator.js";

describe("Decorator", () => {
    it("marks a function as a decorator and returns it", () => {
        const fn = () => {};
        const decorated = Decorator(fn);

        expect(decorated).equal(fn);
        expect(Decorator.is(decorated)).equal(true);
    });

    it("reports unmarked functions as non-decorators", () => {
        expect(Decorator.is(() => {})).equal(false);
    });
});
