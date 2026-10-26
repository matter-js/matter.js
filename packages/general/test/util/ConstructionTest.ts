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

        it("leaves a destroyed subject destroyed", async () => {
            const subject = new Subject();
            await subject.construction.close();
            const changes = new Array<Lifecycle.Status>();
            subject.construction.change.on(status => void changes.push(status));

            subject.construction.crash(new Error("late boom"));

            expect(subject.construction.status).equal(Lifecycle.Status.Destroyed);
            expect(subject.construction.error?.message).equal("late boom");
            expect(changes).deep.equal([]);
        });

        it("keeps the first cause of a destroyed subject", async () => {
            const subject = new Subject();
            await subject.construction.close();

            subject.construction.crash(new Error("first boom"));
            subject.construction.crash(new Error("second boom"));

            expect(subject.construction.error?.message).equal("first boom");
        });

        it("leaves a destroying subject to finish its destruction", async () => {
            const subject = new Subject();
            let release!: () => void;
            const closing = subject.construction.close(() => new Promise<void>(resolve => (release = resolve)));
            expect(subject.construction.status).equal(Lifecycle.Status.Destroying);

            subject.construction.crash(new Error("late boom"));

            expect(subject.construction.status).equal(Lifecycle.Status.Destroying);
            release();
            await closing;
            expect(subject.construction.status).equal(Lifecycle.Status.Destroyed);
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
