/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ansi } from "#tools";
import Mocha from "mocha";
import { mkdir, writeFile } from "node:fs/promises";
import type { Session } from "node:inspector/promises";
import { relative, resolve as resolvePath } from "node:path";
import { pathToFileURL } from "node:url";
import { adaptReporter, afterRun, beforeRun, extendApi, generalSetup, runMocha } from "./mocha.js";
import { TestOptions } from "./options.js";
import type { TestRunner } from "./runner.js";
import { listSupportFiles } from "./util/files.js";

// Load globals so settings get applied
import { FailureDetail } from "./failure-detail.js";
import "./global-definitions.js";
import { Boot } from "./mocks/boot.js";
import { TestDescriptor, TestSuiteDescriptor } from "./test-descriptor.js";

extendApi(Mocha);

export async function testNodejs(runner: TestRunner, format: "cjs" | "esm", repeat = 1) {
    Boot.format = format;

    // Grr Mocha (as of 10.2.0) classifies certain unhandled rejections as "mocha".  For others, it uninstalls its
    // unhandled rejection handler and re-emits the "unhandledRejection" event.  But since it already handled the event,
    // Node knows nothing about this and the event disappears silently.
    //
    // So we must add our own unhandledRejection handler, but only process exceptions if Mocha's handler is not
    // installed, because the code that Mocha uses to determine if an error is a "mocha" error is not exported.
    function unhandledRejection(e: any) {
        if (process.listenerCount("unhandledRejection") === 1) {
            const error = new Error("Unhandled rejection (ignored by mocha)");
            error.cause = e;
            runner.reporter.failRun(FailureDetail(error));
        }
    }

    process.on("unhandledRejection", unhandledRejection);

    if (runner.options.profile) {
        const profiler = new Profiler();
        beforeRun(() => profiler.start());
        afterRun(() => profiler.stop(runner.pkg.resolve("build/profiles")));
    }

    try {
        // Resolve file list once; reused across repeat runs
        const allFiles = await runner.loadFiles(format);
        const supportFileCount = listSupportFiles(format).length;

        const resolvedFiles = allFiles.map(path => {
            path = relative(process.cwd(), path);
            if (path[0] !== ".") {
                path = `./${path}`;
            }
            return path;
        });

        let merged: TestSuiteDescriptor | undefined;

        for (let run = 0; run < repeat; run++) {
            const mocha = createMochaInstance(runner, format, run, repeat);

            resolvedFiles.forEach(path => mocha.addFile(path));

            if (run === 0) {
                await mocha.loadFilesAsync();
            } else if (format === "esm") {
                // ESM modules are cached by URL; re-import test files with a cache-busting query so describe/it
                // blocks re-register on the new Mocha root suite.  Support files are skipped since their side effects
                // (globals, mocks) persist from the first run.

                // Trigger BDD interface setup so global describe/it point to the new root suite
                mocha.suite.emit(Mocha.Suite.constants.EVENT_FILE_PRE_REQUIRE, globalThis, "", mocha);

                for (let i = supportFileCount; i < resolvedFiles.length; i++) {
                    const url = pathToFileURL(resolvePath(process.cwd(), resolvedFiles[i]));
                    url.searchParams.set("run", String(run));
                    await import(url.href);
                }
            } else {
                // CJS: clear require cache for test files so they re-execute
                for (let i = supportFileCount; i < resolvedFiles.length; i++) {
                    const resolved = require.resolve(resolvePath(process.cwd(), resolvedFiles[i]));
                    delete require.cache[resolved];
                }
                await mocha.loadFilesAsync();
            }

            await runMocha(mocha);

            // Mocha leaks listeners; clean them up between runs to avoid MaxListenersExceededWarning
            for (const name of ["unhandledRejection", "uncaughtException"]) {
                for (const listener of process.listeners(name as any)) {
                    if (listener !== unhandledRejection) {
                        process.off(name, listener);
                    }
                }
            }

            const report = mocha.suite.descriptor;
            const path = runner.pkg.resolve(TestDescriptor.DEFAULT_FILENAME);
            const previous = await TestDescriptor.open(path);
            merged = TestDescriptor.merge(previous, report);
        }

        if (format === "esm" && merged) {
            await TestDescriptor.save(runner.pkg.resolve(TestDescriptor.DEFAULT_FILENAME), merged);
        }

        return merged;
    } finally {
        process.off("unhandledRejection", unhandledRejection);
    }
}

let currentMocha: Mocha | undefined;

function createMochaInstance(runner: TestRunner, format: "esm" | "cjs", run: number, repeat: number) {
    const updateStats = runner.pkg.supportsEsm ? format === "esm" : true;

    let title = format.toUpperCase();
    if (repeat > 1) {
        title = `${title} ${ansi.dim(`(run ${run + 1}/${repeat})`)}`;
    }

    const mocha = new Mocha({
        inlineDiffs: true,
        reporter: adaptReporter(Mocha, title, runner.reporter, updateStats),
    });

    currentMocha = mocha;

    generalSetup(mocha);

    TestOptions.apply(mocha, runner.options);

    return mocha;
}

export async function createNodejsMocha(runner: TestRunner, format: "esm" | "cjs") {
    const mocha = createMochaInstance(runner, format, 0, 1);

    const files = await runner.loadFiles(format);
    files.forEach(path => {
        path = relative(process.cwd(), path);
        if (path[0] !== ".") {
            path = `./${path}`;
        }
        mocha.addFile(path);
    });

    await mocha.loadFilesAsync();

    return mocha;
}

export function getCurrentNodejsMocha() {
    if (currentMocha === undefined) {
        throw new Error("No mocha instance active");
    }
    return currentMocha;
}

class Profiler {
    #session?: Session;

    async start() {
        if (this.#session) {
            return;
        }

        let Session;
        try {
            Session = (await import("node:inspector/promises")).Session;
        } catch (e) {
            console.error(`We don't support profiling on this version of Node.js: ${e}`);
            return;
        }

        this.#session = new Session();
        this.#session.connect();
        await this.#session.post("Profiler.enable");
        await this.#session.post("Profiler.start");
    }

    async stop(outputDir: string) {
        if (!this.#session) {
            return;
        }

        const { profile } = await this.#session.post("Profiler.stop");
        await this.#session.post("Profiler.disable");

        await mkdir(outputDir, { recursive: true });
        await writeFile(
            `${outputDir}/test-${new Date().toISOString().slice(0, 19)}.cpuprofile`,
            JSON.stringify(profile),
        );

        this.#session = undefined;
    }
}
