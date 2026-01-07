/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import Mocha from "mocha";
import { mkdir, writeFile } from "node:fs/promises";
import type { Session } from "node:inspector/promises";
import { relative } from "node:path";
import { adaptReporter, afterRun, beforeRun, extendApi, generalSetup, runMocha } from "./mocha.js";
import { TestOptions } from "./options.js";
import type { TestRunner } from "./runner.js";

// Load globals so settings get applied
import { FailureDetail } from "./failure-detail.js";
import "./global-definitions.js";
import { Boot } from "./mocks/boot.js";
import { TestDescriptor } from "./test-descriptor.js";

extendApi(Mocha);

export async function testNodejs(runner: TestRunner, format: "cjs" | "esm") {
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
        const mocha = await createNodejsMocha(runner, format);

        await runMocha(mocha);

        const report = mocha.suite.descriptor;
        const path = runner.pkg.resolve(TestDescriptor.DEFAULT_FILENAME);
        const previous = await TestDescriptor.open(path);
        const merged = TestDescriptor.merge(previous, report);

        if (format === "esm") {
            await TestDescriptor.save(path, merged);
        }

        return merged;
    } finally {
        process.off("unhandledRejection", unhandledRejection);

        // Mocha leaks listeners so just remove them all
        for (const name of ["unhandledRejection", "uncaughtException"]) {
            for (const listener of process.listeners(name as any)) {
                process.off(name, listener);
            }
        }
    }
}

let currentMocha: Mocha | undefined;

export async function createNodejsMocha(runner: TestRunner, format: "esm" | "cjs") {
    const updateStats = runner.pkg.supportsEsm ? format === "esm" : true;

    const mocha = new Mocha({
        inlineDiffs: true,
        reporter: adaptReporter(Mocha, format.toUpperCase(), runner.reporter, updateStats),
    });

    currentMocha = mocha;

    generalSetup(mocha);

    TestOptions.apply(mocha, runner.options);

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
