/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IcdCounter } from "#icd/IcdCounter.js";

/** The boot bump is an internal constant; derive it from a zero seed so tests stay agnostic of its value. */
function bootBump(): number {
    return new IcdCounter(0).value;
}

describe("IcdCounter", () => {
    it("advances the seed by a constant boot bump", () => {
        expect(new IcdCounter(500).value).equals(500 + bootBump());
    });

    it("applies a positive boot bump", () => {
        expect(new IcdCounter(10).value).greaterThan(10);
    });

    it("emits the new value on increment", () => {
        const counter = new IcdCounter(0);
        const base = counter.value;
        const seen = new Array<number>();
        counter.changed.on(value => {
            seen.push(value);
        });
        expect(counter.increment()).equals(base + 1);
        expect(counter.increment()).equals(base + 2);
        expect(seen).deep.equals([base + 1, base + 2]);
    });

    it("wraps at 2^32 (uint32 semantics)", () => {
        const counter = new IcdCounter(0xffffffff - bootBump());
        expect(counter.value).equals(0xffffffff);
        expect(counter.increment()).equals(0);
    });
});
