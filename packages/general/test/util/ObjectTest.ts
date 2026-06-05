/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { merge } from "#util/Object.js";

describe("Object utilities", () => {
    describe("merge", () => {
        it("overrides base fields", () => {
            expect(merge({ a: 1, b: 2 }, { b: 3 })).deep.equal({ a: 1, b: 3 });
        });

        it("preserves the base value for undefined overrides", () => {
            expect(merge({ a: 1, b: 2 }, { a: undefined, b: 3 })).deep.equal({ a: 1, b: 3 });
        });

        it("applies multiple overrides left to right", () => {
            expect(merge({ a: 1 }, { a: 2 }, { a: 3 })).deep.equal({ a: 3 });
        });

        it("does not mutate the base", () => {
            const base = { a: 1 };
            merge(base, { a: 2 });
            expect(base).deep.equal({ a: 1 });
        });
    });
});
