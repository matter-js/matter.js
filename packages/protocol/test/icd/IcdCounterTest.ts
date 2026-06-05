/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdCounter } from "#icd/IcdCounter.js";

/** The boot bump is an internal constant; derive it from a zero seed so tests stay agnostic of its value. */
function bootBump(): number {
    const counter = new IcdCounter();
    counter.seed(0);
    return counter.counter.value!;
}

describe("IcdCounter", () => {
    it("advances the seed by a constant boot bump", () => {
        const bump = bootBump();
        const counter = new IcdCounter();
        counter.seed(500);
        expect(counter.counter.value).equals(500 + bump);
    });

    it("exposes the bumped value after seeding for immediate persist", () => {
        const counter = new IcdCounter();
        counter.seed(10);
        expect(counter.counter.value!).greaterThan(10);
    });

    it("emits on increment", () => {
        const counter = new IcdCounter();
        counter.seed(0);
        const base = counter.counter.value!;
        const seen = new Array<number>();
        counter.counter.on(value => {
            seen.push(value);
        });
        expect(counter.increment()).equals(base + 1);
        expect(counter.increment()).equals(base + 2);
        expect(seen).deep.equals([base + 1, base + 2]);
    });

    it("wraps at 2^32 (uint32 semantics)", () => {
        const counter = new IcdCounter();
        counter.seed(0xffffffff - bootBump());
        expect(counter.counter.value).equals(0xffffffff);
        expect(counter.increment()).equals(0);
    });

    it("rejects use before seeding", () => {
        const counter = new IcdCounter();
        expect(() => counter.counter).throws();
        expect(() => counter.increment()).throws();
        expect(counter.isSeeded).equals(false);
    });

    it("rejects double seeding", () => {
        const counter = new IcdCounter();
        counter.seed(1);
        expect(() => counter.seed(2)).throws();
    });
});
