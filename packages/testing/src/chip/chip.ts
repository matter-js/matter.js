/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { globSync } from "#tools";
import { Subject } from "../device/subject.js";
import { Test } from "../device/test.js";
import type { Container } from "../docker/container.js";
import { afterOne, beforeOne } from "../mocha.js";
import { getCurrentNodejsMocha } from "../nodejs.js";
import { TestDescriptor } from "../test-descriptor.js";
import { PicsFile } from "./pics/file.js";
import { State } from "./state.js";

/**
 * CHIP test harness.
 *
 * "CHIP tests" are official tests implemented in the connectedhomeip repository.
 *
 * This harness uses Mocha to run a {@link Test} against a {@link Subject}.
 *
 * We provide utility functions for tests against in-process matter.js subjects.  But the subject interface is generic
 * and requires only setup and teardown logic, so could easily support out-of-process subjects.
 *
 * We execute test logic within a Docker container available at {@link https://github.com/matter-js/matter.js-chip}.
 */
export interface Chip {
    (subject: Subject): chip.Builder;
    (...include: string[]): chip.Builder;

    /**
     * Mocha instance.  Must be set prior to use of other methods.
     */
    mocha: undefined | Mocha;

    /**
     * Initialize.  This must run before defining tests to enable test definition via globs.
     */
    initialize(): Promise<void>;

    /**
     * Shut down.  Deactivates any active testee and removes the test container.
     */
    close(): Promise<void>;

    /**
     * Open a command pipe.
     */
    openPipe(name: string): Promise<void>;

    /**
     * Add teardown logic.
     */
    onClose(fn: () => Promise<void>): void;

    /**
     * Obtain a {@link Test} for the given name or {@link TestDescriptor}.
     */
    testFor(identifier: string | TestDescriptor): Test;

    /**
     * Default test subject.  If this is set, test implementations may omit the subject.
     */
    defaultSubject: Subject.Factory;

    /**
     * Clear the MDNS cache.
     */
    clearMdns(): Promise<void>;

    /**
     * The CHIP container.  Must be initialized before access.
     */
    container: Container;

    /**
     * The active test.  Throws if no test is running.
     */
    activeTest: Test;

    /**
     * All known CHIP tests.
     */
    tests: TestDescriptor.Filesystem;

    /**
     * Determine whether CHIP testing is initialized.
     */
    isInitialized: boolean;

    /**
     * The active PICS configuration.
     */
    defaultPics: PicsFile;

    /**
     * The filename for default PICS in the container.
     */
    defaultPicsFile: string;

    /**
     * The timeout for tests without an explicit timeout (defaults to 30s).
     */
    defaultTimeoutMs: number;

    /**
     * Set to false to disable container pull before test execution.
     */
    pullBeforeTesting: boolean;
}

function createBuilder(initial: {
    include?: string | string[];
    exclude?: string | string[];
    defaultSubject?: Subject.Factory;
    beforeStart?: chip.BeforeHook;
    beforeTest?: chip.BeforeHook;
    only?: boolean;
}): chip.Builder {
    const implementations = new Map<TestDescriptor, Mocha.Test>();
    let subject: undefined | Subject.Factory;
    let startCommissioned = true;
    let only = false;
    const beforeStartHooks = Array<chip.BeforeHook>();
    const beforeTestHooks = Array<chip.BeforeHook>();
    const args = Array<string>();

    const builder: chip.Builder = {
        include(...glob: string[]) {
            const includePaths = new Set<string>();
            for (const pattern of glob) {
                const paths = globSync(glob, chip.tests);

                if (!paths.length) {
                    throw new Error(`No tests included for glob ${pattern}`);
                }

                for (const path of paths) {
                    includePaths.add(path);
                }
            }

            const tests = TestDescriptor.filter(chip.tests.descriptor, {
                includePaths: [...includePaths],
                kinds: ["py", "yaml"],
                pics: subject?.pics ?? chip.defaultPics,
            });

            if (!tests?.members) {
                return this;
            }

            for (const member of tests.members) {
                defineTests(member);
            }

            return this;
        },

        exclude(...glob: string[]) {
            const tests = TestDescriptor.filter(chip.tests.descriptor, { includePaths: globSync(glob, chip.tests) });

            if (!tests) {
                return this;
            }

            TestDescriptor.visit(tests, descriptor => {
                const impl = implementations.get(descriptor);
                if (!impl) {
                    return;
                }

                implementations.delete(descriptor);
                if (!impl?.parent) {
                    return;
                }

                const pos = impl.parent.tests.indexOf(impl);
                if (pos !== -1) {
                    impl.parent.tests.splice(pos, 1);
                }
            });

            return this;
        },

        subject(newSubject: Subject.Factory) {
            subject = newSubject;
            return this;
        },

        beforeStart(hook: chip.BeforeHook) {
            beforeStartHooks.push(hook);
            return this;
        },

        beforeTest(hook: chip.BeforeHook) {
            beforeTestHooks.push(hook);
            return this;
        },

        args(...newArgs: (string | number)[]) {
            args.push(...newArgs.map(arg => `${arg}`));
            return this;
        },

        uncommissioned() {
            startCommissioned = false;
            return this;
        },

        only() {
            only = true;
            return this;
        },
    };

    for (const key in initial) {
        const fn = (builder as unknown as Record<string, (...args: any[]) => chip.Builder>)[key];
        if (typeof fn === "function") {
            const arg = initial[key as keyof typeof initial];
            if (Array.isArray(arg)) {
                fn(...arg);
            } else {
                fn(arg);
            }
        }
    }

    return builder;

    function defineTests(descriptor: TestDescriptor) {
        switch (descriptor.kind) {
            case "suite":
                defineSuite(descriptor);
                break;

            default:
                defineTest(descriptor);
                break;
        }
    }

    function defineSuite(descriptor: TestDescriptor) {
        const mocha = getCurrentNodejsMocha();

        const { name, members } = descriptor;
        if (!members?.length) {
            return;
        }

        if (descriptor.name === mocha.suite.title) {
            for (const member of members) {
                defineTests(member);
            }
            return;
        }

        for (const suite of mocha.suite.suites) {
            if (suite.title === name) {
                const revertSuite = mocha.suite;
                try {
                    mocha.suite = suite;
                    for (const member of members) {
                        defineTests(member);
                    }
                } finally {
                    mocha.suite = revertSuite;
                }
                return;
            }
        }

        describe(name, () => {
            for (const member of members) {
                defineTests(member);
            }
        });
    }

    function defineTest(descriptor: TestDescriptor) {
        State.install();
        const test = chip.testFor(descriptor);

        const myIt = only ? it.only : it;
        const mochaTest = myIt(descriptor.name, function () {
            this.timeout(descriptor.timeoutMs ?? chip.defaultTimeoutMs);
            return State.run(test, args, (subject, test) => runBeforeHooks(beforeTestHooks, subject, test));
        });

        // We do this separately from the test itself because we don't want activation to appear as part of the test if
        // it fails
        beforeOne(mochaTest, async () =>
            State.activateSubject(subject ?? State.subject, startCommissioned, test, (subject, test) =>
                runBeforeHooks(beforeStartHooks, subject, test),
            ),
        );

        mochaTest.descriptor = test.descriptor;
        implementations.set(descriptor, mochaTest);

        afterOne(mochaTest, State.deactivateSubject);
    }
}

function chipFn(subjectOrFirstInclusion: Subject.Factory | string | undefined, ...include: string[]): chip.Builder {
    if (typeof subjectOrFirstInclusion === "function") {
        return chip()
            .subject(subjectOrFirstInclusion)
            .include(...include);
    }

    if (typeof subjectOrFirstInclusion === "string") {
        include = [subjectOrFirstInclusion, ...include];
    }

    return createBuilder({ include: [...include] });
}

Object.defineProperties(chipFn, {
    defaultSubject: {
        set(subject: Subject.Factory) {
            State.subject = subject;
        },
    },

    activeTest: {
        get: () => State.test,
    },

    container: {
        get: () => State.container,
    },

    tests: {
        get: () => State.tests,
    },

    isInitialized: {
        get: () => State.isInitialized,
    },

    defaultPics: {
        get: () => State.defaultPics,
    },

    defaultPicsFilename: {
        get: () => State.defaultPicsFilename,
    },

    pullBeforeTesting: {
        get() {
            return State.pullBeforeTesting;
        },

        set(value: boolean) {
            State.pullBeforeTesting = value;
        },
    },

    initialize: { value: State.initialize.bind(State) },
    close: { value: State.close.bind(State) },
    openPipe: { value: State.openPipe.bind(State) },
    onClose: { value: State.onClose.bind(State) },
    testFor: { value: State.testFor.bind(State) },
    clearMdns: { value: State.clearMdns.bind(State) },
});

export const chip = chipFn as Chip;

chip.defaultTimeoutMs = 30 * 60 * 1000;

function runBeforeHooks(hooks: chip.BeforeHook[], ...args: Parameters<chip.BeforeHook>) {
    const promises = new Array<Promise<void>>();
    for (const hook of hooks) {
        const promise = hook(...args);
        if (promise) {
            promises.push(promise);
        }
    }
    if (promises) {
        return Promise.all(promises).then(() => {});
    }
}

export namespace chip {
    /**
     * The test implementation.
     */
    export type TestSelection = Test | string;

    export interface BeforeHook {
        (subject: Subject, test: Test): void | Promise<void>;
    }

    export interface BeforeHookOptions {
        timeout?: number;
    }

    export interface Builder {
        /**
         * Add tests to include.
         *
         * @param glob one or more sh-style globs for selecting tests based on ID
         */
        include(...glob: string[]): Builder;

        /**
         * Exclude tests.  Only affects tests already included.
         */
        exclude(...glob: string[]): Builder;

        /**
         * Set the test subject.  Optional if you set {@link chip.subject}.
         */
        subject(subject: Subject.Factory): Builder;

        /**
         * Execute a function after initializing but before starting the subject.
         */
        beforeStart(hook: BeforeHook): Builder;

        /**
         * Execute a function after starting the subject but before running the test.
         */
        beforeTest(hook: BeforeHook): Builder;

        /**
         * Add arguments to the test runner.
         */
        args(...args: (string | number)[]): Builder;

        /**
         * Start subject as new-from-factory rather than commissioned.
         */
        uncommissioned(): Builder;

        /**
         * Run following tests defined by this builder only.
         */
        only(): Builder;
    }
}
