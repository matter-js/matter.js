/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { InternalError } from "#MatterError.js";
import { Lifetime } from "#util/Lifetime.js";

describe("Lifetime", () => {
    describe("creation", () => {
        it("mock is open and detached from process", () => {
            const lifetime = Lifetime.mock;

            expect(lifetime.isOpen).equal(true);
            expect(lifetime.isClosing).equal(false);
            expect(lifetime.isClosed).equal(false);
            expect(lifetime.owner).undefined;
        });

        it("join creates an owned sublifetime", () => {
            const root = Lifetime.mock;
            const child = root.join("child");

            expect(child.owner).equal(root);
            expect(root.spans.has(child)).equal(true);
        });

        it("uses a single name directly and multiple names as a tuple", () => {
            const root = Lifetime.mock;

            expect(root.join("solo").name).equal("solo");
            expect(root.join("a", "b").name).deep.equal(["a", "b"]);
        });
    });

    describe("disposal", () => {
        it("removes a leaf sublifetime from its owner", () => {
            const root = Lifetime.mock;
            const child = root.join("child");

            child[Symbol.dispose]();

            expect(child.isClosed).equal(true);
            expect(root.spans.has(child)).equal(false);
        });

        it("becomes a zombie when disposed with active sublifetimes", () => {
            const root = Lifetime.mock;
            const child = root.join("child");
            child.join("grandchild");

            child[Symbol.dispose]();

            expect(child.isClosed).equal(true);
            expect(root.spans.has(child)).equal(true);
        });
    });

    describe("closing", () => {
        it("marks the lifetime as closing and returns a stable sublifetime", () => {
            const lifetime = Lifetime.mock.join("task");

            const closing = lifetime.closing();

            expect(lifetime.isClosing).equal(true);
            expect(lifetime.isOpen).equal(false);
            expect(closing.name).equal("closing");
            expect(lifetime.closing()).equal(closing);
        });

        it("disposes the parent when the closing lifetime is disposed", () => {
            const lifetime = Lifetime.mock.join("task");
            const closing = lifetime.closing();

            closing[Symbol.dispose]();

            expect(lifetime.isClosed).equal(true);
        });
    });

    describe("ownership", () => {
        it("moves a sublifetime to a new owner", () => {
            const root = Lifetime.mock;
            const a = root.join("a");
            const b = root.join("b");

            a.owner = b;

            expect(a.owner).equal(b);
            expect(b.spans.has(a)).equal(true);
            expect(root.spans.has(a)).equal(false);
        });

        it("refuses to move the root lifetime", () => {
            const root = Lifetime.mock;

            expect(() => (root.owner = Lifetime.mock)).throws(InternalError, "root lifetime");
        });
    });

    describe("of", () => {
        it("returns the process lifetime for an unowned subject", () => {
            expect(Lifetime.of({})).equal(Lifetime.process);
        });

        it("returns an explicit owner", () => {
            const owner = Lifetime.mock;
            expect(Lifetime.of({ [Lifetime.owner]: owner })).equal(owner);
        });
    });
});
