/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogDestination } from "#log/LogDestination.js";
import { Logger } from "#log/Logger.js";
import { LogLevel } from "#log/LogLevel.js";
import { MatterError } from "#MatterError.js";
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

        it("runs onSuccess listeners once it completes, and at once when it completed before", async () => {
            let finish!: () => void;
            const subject = new Subject(
                () =>
                    new Promise<void>(resolve => {
                        finish = resolve;
                    }),
            );
            const calls = new Array<string>();
            subject.construction.onSuccess(() => void calls.push("waiting"));

            finish();
            await subject.construction.ready;
            subject.construction.onSuccess(() => void calls.push("late"));
            await MockTime.yield();

            expect(calls).deep.equal(["waiting", "late"]);
        });

        it("does not run onSuccess listeners and logs the cause once when it crashes", async () => {
            const errors = new Array<string>();
            const destination = LogDestination({
                name: "construction-on-success-test",
                level: LogLevel.ERROR,
                write: (text, message) => {
                    if (message.level >= LogLevel.ERROR) {
                        errors.push(text);
                    }
                },
            });
            Logger.destinations[destination.name] = destination;
            try {
                let fail!: (error: Error) => void;
                const subject = new Subject(
                    () =>
                        new Promise<void>((_resolve, reject) => {
                            fail = reject;
                        }),
                );
                let succeeded = false;
                subject.construction.onSuccess(() => {
                    succeeded = true;
                });

                fail(new MatterError("Initialization refused for test"));
                await MockTime.yield();
                await MockTime.yield();

                expect(subject.construction.status).equal(Lifecycle.Status.Crashed);
                expect(succeeded).equal(false);
                expect(errors.filter(text => text.includes("Initialization refused for test")).length).equal(1);
            } finally {
                delete Logger.destinations[destination.name];
            }
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
