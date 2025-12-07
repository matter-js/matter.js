/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Can't import Mocha in the browser so just import type here
import type MochaType from "mocha";
import { Test } from "mocha";
import { FailureDetail } from "./failure-detail.js";
import { Boot } from "./mocks/boot.js";
import { LoggerHooks } from "./mocks/logging.js";
import { TestOptions } from "./options.js";
import { Reporter } from "./reporter.js";
import type { TestDescriptor } from "./test-descriptor.js";
import { TextDiff } from "./text-diff.js";
import { wtf } from "./util/wtf.js";
import { WebReporter } from "./web-reporter.js";

// We allow fixed 60s. timeout for our extended "before/after each test" hooks.  To make this configurable we'd need
// to perform timeout handling ourselves so avoiding for now
const TEST_HOOK_TIMEOUT = 60000;

const beforeOneHook = Symbol("before-hook");
const afterOneHook = Symbol("after-hook");

interface HookableTest extends Test {
    [beforeOneHook]?: Mocha.Func | Mocha.AsyncFunc;
    [afterOneHook]?: Mocha.Func | Mocha.AsyncFunc;
}

/**
 * Extension to Mocha - allows installing a before handler for a specific test.
 */
export function beforeOne(test: HookableTest, fn: Mocha.Func | Mocha.AsyncFunc) {
    if (test[beforeOneHook]) {
        throw new Error("Only one beforeTest currently allowed");
    }
    test[beforeOneHook] = fn;
}

/**
 * Extension to Mocha - allows installing an after handler for a specific test.
 */
export function afterOne(test: HookableTest, fn: Mocha.Func | Mocha.AsyncFunc) {
    if (test[afterOneHook]) {
        throw new Error("Only one afterTest currently allowed");
    }
    test[afterOneHook] = fn;
}

export function generalSetup(mocha: Mocha) {
    const Base = (mocha.constructor as typeof Mocha).reporters.Base;

    // White text, 16-bit and 256-bit green background
    Base.colors["diff added inline"] = "97;42;48;5;22" as any;

    // White text, 16-bit and 256-bit red background
    Base.colors["diff removed inline"] = "97;41;48;5;52" as any;

    function filterLogs(hook: "beforeAll" | "afterAll" | "beforeEach" | "afterEach") {
        const actual = mocha.suite[hook] as (this: any, fn: Mocha.Func) => any;
        mocha.suite[hook] = function (this: any, fn: Mocha.Func) {
            return actual.call(this, async function (this: any, ...args: any) {
                return await onlyLogFailure(() => fn.apply(this, args));
            });
        } as any;
    }

    filterLogs("beforeAll");
    filterLogs("afterAll");
    filterLogs("beforeEach");
    filterLogs("afterEach");

    mocha.suite.beforeEach(function (done) {
        this.timeout(TEST_HOOK_TIMEOUT);
        return ((this.currentTest as HookableTest)[beforeOneHook] as any)?.call(this, done);
    });

    mocha.suite.afterEach(function (done) {
        this.timeout(TEST_HOOK_TIMEOUT);
        for (const hook of LoggerHooks.afterEach) {
            hook(mocha);
        }
        return ((this.currentTest as HookableTest)[afterOneHook] as any)?.call(this, done);
    });

    TextDiff.generator = Base.generateDiff.bind(Base);
}

export function extendApi(Mocha: typeof MochaType) {
    (Mocha.reporters.Base as any).maxDiffSize = 0xffff;

    const descriptors = new WeakMap<Mocha.Suite | Mocha.Test, TestDescriptor>();

    Object.defineProperty(Mocha.Suite.prototype, "descriptor", {
        get(): TestDescriptor {
            const suite = this as Mocha.Suite;
            let descriptor = descriptors.get(suite);
            if (descriptor) {
                return descriptor;
            }

            descriptor = {
                get name() {
                    return suite.title;
                },

                get kind() {
                    return "suite" as const;
                },

                get path() {
                    return suite.file;
                },

                get members() {
                    const members = Array<TestDescriptor>();

                    for (const sub of suite.suites) {
                        members.push(sub.descriptor);
                    }

                    for (const test of suite.tests) {
                        if (test.descriptor === undefined) {
                            test.descriptor = { name: test.title, kind: "js" };
                        }
                        members.push(test.descriptor);
                    }

                    return members;
                },
            };

            descriptors.set(suite, descriptor);

            return descriptor;
        },
    });

    Object.defineProperty(Mocha.Test.prototype, "descriptor", {
        set(descriptor: TestDescriptor) {
            descriptors.set(this, descriptor);
        },

        get() {
            let descriptor = descriptors.get(this);
            if (descriptor) {
                return descriptor;
            }

            descriptor = {
                name: (this as Mocha.Test).title,
                kind: "js",
            };

            descriptors.set(this, descriptor);

            return descriptor;
        },
    });
}

function instrumentSuites(mocha: Mocha) {
    for (const suite of mocha.suite.suites) {
        suite.beforeAll(beforeEachFile);

        // Move our beforeAll hook so it runs before the suite's beforeAll hooks
        const hooks = (suite as any)._beforeAll as unknown[];
        const myHook = hooks.pop();
        hooks.unshift(myHook);
    }
}

export async function runMocha(mocha: Mocha) {
    instrumentSuites(mocha);

    await onlyLogFailure(async () => {
        for (const hook of beforeRunHooks) {
            await hook();
        }
    });

    await new Promise<Mocha.Runner>(resolve => {
        const runner = mocha.run(() => resolve(runner));
    });

    await onlyLogFailure(async () => {
        for (const hook of afterRunHooks) {
            await hook();
        }
    });

    wtf.dump();
}

// Reset mocks before each file.  Suites could conceivably have callbacks that occur across tests.  If individual tests
// need a reset the suite needs to handle itself.
function beforeEachFile() {
    Boot.reboot();
}

export function adaptReporter(
    Mocha: typeof MochaType,
    title: string,
    reporter: Reporter,
    updateStats: boolean = false,
) {
    const RUNNER = Mocha.Runner.constants;

    let logs = Array<string>();

    class MochaReporter extends Mocha.reporters.Base {
        constructor(runner: Mocha.Runner) {
            super(runner);

            runner.once(RUNNER.EVENT_RUN_BEGIN, () => {
                if (!MatterHooks) {
                    throw new Error("Matter hooks not loaded");
                }
                MatterHooks.loggerSink = text => {
                    logs.push(text);
                };
                reporter.beginRun(title, this.translatedStats);
            });

            runner.on(RUNNER.EVENT_SUITE_BEGIN, suite => {
                reporter.beginSuite(suite.titlePath(), this.translatedStats);
            });

            runner.on(RUNNER.EVENT_TEST_BEGIN, test => {
                if (updateStats && test.descriptor) {
                    test.descriptor.runAt = new Date();
                }
                logs = (test as any).logs = [];
                reporter.beginTest(test.title, this.translatedStats);
            });

            if (updateStats) {
                runner.on(RUNNER.EVENT_TEST_PASS, test => {
                    if (!test.descriptor) {
                        return;
                    }

                    test.descriptor.durationMs = test.duration;
                    test.descriptor.passed = true;
                });
            }

            runner.on(RUNNER.EVENT_TEST_FAIL, (test, error) => {
                if (updateStats && test.descriptor) {
                    test.descriptor.durationMs = test.duration;
                    test.descriptor.passed = false;
                }
                const logs = (test as any).logs as string[];
                reporter.failTest(test.title, FailureDetail(error, undefined, logs));
                wtf.dump();
            });

            runner.once(RUNNER.EVENT_RUN_END, () => {
                if (!MatterHooks) {
                    throw new Error("Matter hooks not loaded");
                }
                MatterHooks.loggerSink = undefined;
                reporter.endRun(this.translatedStats);
            });
        }

        get translatedStats() {
            return {
                total: this.runner.total,
                complete: this.stats.tests,
                failures: this.stats.failures,
            };
        }
    }

    return MochaReporter;
}

export function browserSetup(mocha: BrowserMocha) {
    mocha.setup("bdd");

    (globalThis as any).MatterTest = {
        // Starts Mocha (called by clicking link)
        start: () => {
            instrumentSuites(mocha);
            const root = document.querySelector("#mocha");
            if (root) {
                root.innerHTML = "";
            }
            return mocha.run();
        },

        // Start Mocha, proxying reporting through console to Playwright and completing once Mocha has finished
        auto: async function (options: TestOptions) {
            TestOptions.apply(mocha, options);
            mocha.reporter(adaptReporter(Mocha, "Web", new WebReporter()));
            return new Promise<void>(accept => {
                const runner = this.start();
                runner.on("end", accept);
            });
        },
    };
}
const beforeRunHooks = Array<() => void | Promise<void>>();
const afterRunHooks = Array<() => void | Promise<void>>();

export function beforeRun(hook: () => void | Promise<void>) {
    beforeRunHooks.push(hook);
}

export function afterRun(hook: () => void | Promise<void>) {
    afterRunHooks.push(hook);
}

/**
 * Some of our setup/teardown logic logs profusely. Hide these logs unless something goes wrong.
 */
async function onlyLogFailure(fn: () => any) {
    if (!MatterHooks) {
        throw new Error("Matter hooks not loaded");
    }

    const logs = Array<string>();
    const existingSink = MatterHooks.loggerSink;
    try {
        MatterHooks.loggerSink = text => {
            logs.push(text);
        };
        return await fn();
    } catch (e) {
        process.stdout.write(logs.join("\n"));
        throw e;
    } finally {
        MatterHooks.loggerSink = existingSink;
    }
}
