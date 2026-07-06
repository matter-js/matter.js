/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { asyncNew, Construction, type Constructable } from "#util/Construction.js";
import { Lifecycle } from "#util/Lifecycle.js";
import { MaybePromise } from "#util/Promises.js";

class Subject implements Constructable {
    readonly construction: Construction<Subject>;
    ready = false;

    constructor(initializer?: () => MaybePromise) {
        this.construction = Construction(
            this,
            initializer ??
                (() => {
                    this.ready = true;
                }),
        );
    }

    toString() {
        return "Subject";
    }
}

describe("Construction", () => {
    describe("synchronous", () => {
        it("becomes active immediately", async () => {
            const subject = new Subject();

            expect(subject.construction.status).equal(Lifecycle.Status.Active);
            expect(await subject.construction).equal(subject);
            expect(subject.ready).equal(true);
        });
    });

    describe("asynchronous", () => {
        it("transitions through initializing to active", async () => {
            let resolve!: () => void;
            const subject = new Subject(() => new Promise<void>(r => (resolve = r)));

            expect(subject.construction.status).equal(Lifecycle.Status.Initializing);

            resolve();
            await subject.construction;

            expect(subject.construction.status).equal(Lifecycle.Status.Active);
        });
    });

    describe("asyncNew", () => {
        it("constructs and awaits readiness", async () => {
            const subject = await asyncNew(Subject);

            expect(subject).instanceOf(Subject);
            expect(subject.ready).equal(true);
        });
    });

    describe("crash", () => {
        it("propagates a synchronous initializer error to the caller", () => {
            expect(
                () =>
                    new Subject(() => {
                        throw new Error("sync boom");
                    }),
            ).throws(Error, "sync boom");
        });

        it("captures an asynchronous initializer error as crashed state", async () => {
            const subject = new Subject(async () => {
                throw new Error("async boom");
            });

            await expect(subject.construction.ready).rejectedWith(Error, "async boom");
            expect(subject.construction.status).equal(Lifecycle.Status.Crashed);
            expect(subject.construction.error?.message).equal("async boom");
        });
    });

    describe("assert", () => {
        it("passes while active and throws after close", async () => {
            const subject = new Subject();
            await subject.construction;

            expect(() => subject.construction.assert("subject")).not.throws();

            await subject.construction.close();

            expect(subject.construction.status).equal(Lifecycle.Status.Destroyed);
            expect(() => subject.construction.assert("subject")).throws();
        });
    });
});
