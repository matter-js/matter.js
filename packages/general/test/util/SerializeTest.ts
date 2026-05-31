/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";
import { serialize } from "#util/serialize.js";

describe("serialize", () => {
    describe("primitives", () => {
        it("renders numbers, bigints and booleans without quotes", () => {
            expect(serialize(42)).equal("42");
            expect(serialize(42n)).equal("42");
            expect(serialize(true)).equal("true");
            expect(serialize(false)).equal("false");
        });

        it("quotes strings", () => {
            expect(serialize("hello")).equal('"hello"');
        });

        it("renders null and undefined", () => {
            expect(serialize(null)).equal("null");
            expect(serialize(undefined)).undefined;
        });

        it("renders bytes as hex", () => {
            expect(serialize(Bytes.fromHex("0102"))).equal("0102");
        });
    });

    describe("composites", () => {
        it("renders arrays", () => {
            expect(serialize([1, 2, 3])).equal("[ 1, 2, 3 ]");
            expect(serialize([])).equal("[]");
        });

        it("renders objects with unquoted identifier keys", () => {
            expect(serialize({ a: 1, b: "x" })).equal('{ a: 1, b: "x" }');
            expect(serialize({})).equal("{}");
        });

        it("omits undefined properties", () => {
            expect(serialize({ a: 1, b: undefined })).equal("{ a: 1 }");
        });

        it("quotes keys that are not valid identifiers", () => {
            expect(serialize({ "has space": 1 })).equal('{ "has space": 1 }');
            expect(serialize({ "1leading": 1 })).equal('{ "1leading": 1 }');
        });
    });

    describe("namespace helpers", () => {
        it("isPrimitive distinguishes structures from scalars", () => {
            expect(serialize.isPrimitive(5)).equal(true);
            expect(serialize.isPrimitive("x")).equal(true);
            expect(serialize.isPrimitive(null)).equal(true);
            expect(serialize.isPrimitive(new Date())).equal(true);
            expect(serialize.isPrimitive([1])).equal(false);
            expect(serialize.isPrimitive({ a: 1 })).equal(false);
        });

        it("asIs renders via toString", () => {
            expect(serialize(serialize.asIs("raw"))).equal("raw");
        });
    });
});
