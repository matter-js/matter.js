/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { asError, causedBy, errorOf, repackErrorAs } from "#util/Error.js";

class FooError extends Error {}

describe("Error utils", () => {
    describe("asError", () => {
        it("returns Error with 'Unknown error' for undefined", () => {
            const e = asError(undefined);
            expect(e).instanceof(Error);
            expect(e.message).equal("Unknown error");
        });

        it("returns Error with 'Unknown error' for null", () => {
            const e = asError(null);
            expect(e).instanceof(Error);
            expect(e.message).equal("Unknown error");
        });

        it("wraps strings as Error", () => {
            const e = asError("boom");
            expect(e).instanceof(Error);
            expect(e.message).equal("boom");
        });

        it("passes through real Errors", () => {
            const original = new FooError("x");
            expect(asError(original)).equal(original);
        });
    });

    describe("causedBy", () => {
        it("returns false for undefined error without throwing", () => {
            expect(causedBy(undefined, FooError)).false;
        });

        it("returns false for null error without throwing", () => {
            expect(causedBy(null, FooError)).false;
        });

        it("detects direct cause match", () => {
            expect(causedBy(new FooError("x"), FooError)).true;
        });

        it("detects nested cause match", () => {
            const inner = new FooError("inner");
            const outer = new Error("outer");
            outer.cause = inner;
            expect(causedBy(outer, FooError)).true;
        });
    });

    describe("errorOf", () => {
        it("returns 'Unknown error' for undefined", () => {
            expect(errorOf(undefined).message).equal("Unknown error");
        });

        it("returns 'Unknown error' for null", () => {
            expect(errorOf(null).message).equal("Unknown error");
        });
    });

    describe("repackErrorAs", () => {
        it("throws TypeError when repackaging undefined", () => {
            expect(() => repackErrorAs(undefined, FooError)).throws(TypeError);
        });
    });
});
