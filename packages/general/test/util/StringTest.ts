/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { camelize, capitalize } from "#util/identifier-case.js";

const CAMELIZE_TESTS = {
    foo: "Foo",
    "foo bar": "FooBar",
    FOOBar: "FooBar",
    "foo/bar": "FooBar",
    FooBar: "FooBar",
    "foo bar biz baz": "FooBarBizBaz",
    foo100bar: "Foo100Bar",
    "Wake On LAN": "WakeOnLan",
    hello$: "Hello$",
    hello$wOrLd: "Hello$wOrLd",
    "foo bar biz baz $ huhu": "FooBarBizBaz$ huhu",
};

describe("String", () => {
    describe("capitalize", () => {
        it("capitalizes", () => {
            expect(capitalize("foo")).equal("Foo");
        });
    });

    describe("camelize", () => {
        it(`camelizes lowercase`, () => {
            expect(camelize("Foo")).equal("foo");
        });

        for (const [k, v] of Object.entries(CAMELIZE_TESTS)) {
            it(`camelizes uppercase "${k}"`, () => {
                expect(camelize(k, true)).equal(v);
            });

            it(`camelizes lowercase "${k}"`, () => {
                expect(camelize(k)).equal(v[0].toLowerCase() + v.slice(1));
            });
        }
    });
});
