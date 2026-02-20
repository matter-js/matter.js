/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ansi, Package, Progress, std } from "#tools";
import debug from "debug";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { FailureDetail } from "./failure-detail.js";
import { FailureReporter } from "./failure-reporter.js";
import { NodejsReporter } from "./nodejs-reporter.js";
import { testNodejs } from "./nodejs.js";
import { TestOptions } from "./options.js";
import { Reporter } from "./reporter.js";
import { listSupportFiles } from "./util/files.js";
import { testWeb } from "./web.js";

const HARNESS_CONFIG_FILE = "build/esm/test/test.harness.js";

export class TestRunner {
    static #current?: TestRunner;

    static get current() {
        if (this.#current === undefined) {
            throw new Error("No test active test runner");
        }

        return this.#current;
    }

    readonly reporter: Reporter;
    #spec = Array<string>();
    #configured = false;

    /**
     * If present the web runner will run this preprocessor on its entrypoint file.  You can modify {@link lines} to
     * add or change entrypoint logic.
     */
    entrypointPreprocessor?: (this: unknown, lines: string[]) => void;

    constructor(
        readonly pkg: Package,
        readonly progress: Progress,
        readonly options: TestOptions,
    ) {
        TestRunner.#current = this;

        this.reporter = new (class extends NodejsReporter {
            constructor() {
                super(progress);
            }

            override failRun(detail: FailureDetail) {
                std.err.write("\n");
                FailureReporter.report(std.err, detail, "Test suite crash");
                std.err.write("\n");
                process.exit(1);
            }
        })();

        if (options.spec === undefined) {
            this.#spec = ["test/**/*Test.ts"];
        } else if (Array.isArray(options.spec)) {
            this.#spec = options.spec;
        } else {
            this.#spec = [options.spec];
        }

        if (options.debug) {
            debug.enable("mocha:*");
        }
    }

    async runNode(format: "esm" | "cjs" = "esm", repeat?: number) {
        await this.#configure();

        return await this.#run(this.progress, () => testNodejs(this, format, repeat));
    }

    async runWeb(manual = false) {
        await this.#configure();

        await this.#run(this.progress, () => testWeb(this, manual));
    }

    async #configure() {
        if (this.#configured) {
            return;
        }

        if (this.pkg.hasFile(HARNESS_CONFIG_FILE)) {
            await import(this.pkg.resolve(HARNESS_CONFIG_FILE));
        }

        this.#configured = true;
    }

    async loadFiles(format: "esm" | "cjs") {
        const tests = Array<string>();
        for (let spec of this.#spec) {
            spec = spec.replace(/\.ts$/, ".js");
            spec = relative(this.pkg.path, spec);
            if (!spec.startsWith(".") && !spec.startsWith("build/") && !spec.startsWith("dist/")) {
                spec = `build/${format}/${spec}`;
            }

            tests.push(...(await this.pkg.glob(spec)));
        }

        // Automatically map source files to an appropriate test file
        for (let i = 0; i < tests.length; i++) {
            if (tests[i].indexOf("/src/") === -1) {
                continue;
            }

            tests[i] = await this.#mapSourceToTest(tests[i]);
        }

        if (!tests.length) {
            fatal(`No files match ${this.#spec.join(", ")}`);
        }

        return [...listSupportFiles(format), ...tests];
    }

    async #run<T>(progress: Progress, runner: () => Promise<T>) {
        const result = await runner();

        if (progress.status !== Progress.Status.Success) {
            fatal(`Test ${progress.status.toLowerCase()}, aborting`);
        }

        return result;
    }

    async #mapSourceToTest(filename: string) {
        // First look for special "// matter-test" marker that manually maps to test file
        try {
            const src = await readFile(filename, "utf-8");
            const [, args] = src.match(/\/\/ matter-test (.*)/) ?? [];
            if (args) {
                return this.#parseMarkerArgs(args, filename);
            }
        } catch (e) {
            // Ignore errors as file errors will be handled by Mocha
        }

        // By default we just map from src directory to test directory
        return filename.replace("/src/", "/test/");
    }

    #parseMarkerArgs(args: string, filename: string) {
        const parts = args.match(/[a-z]+=(?:"(?:[^"\\]|\\.)+"|[^"]\S+)/g);
        if (!parts) {
            throw new Error("No matter-test parameters detected");
        }

        let file: string | undefined;
        let module: string | undefined;
        for (const part of parts) {
            const equalPos = part.indexOf("=");

            const name = part.substring(0, equalPos);

            let value = part.substring(equalPos + 1);
            if (value[0] === '"') {
                value = value
                    .substring(1, value.length - 2)
                    .replace(/\\"/g, '"')
                    .replace(/\\\\/g, '"');
            }

            switch (name) {
                case "file":
                    file = value;
                    break;

                case "module":
                    module = value;
                    break;

                default:
                    throw new Error(`Unrecognized matter-test parameter "${name}"`);
            }
        }

        if (file === undefined) {
            throw new Error(`matter-test parameter "file" is required`);
        }

        if (file.startsWith("./") || file.startsWith("../")) {
            file = resolve(dirname(filename), file);
        }

        let testPkg;
        if (module === undefined) {
            testPkg = this.pkg;
        } else {
            testPkg = this.pkg.findPackage(module);
            if (testPkg === undefined) {
                throw new Error(`Unknown matter-test module "${module}"`);
            }
        }

        return testPkg.resolve("test", file);
    }
}

function fatal(message: string) {
    std.err.write(ansi.bright.red(`\n${message}\n\n`));
    process.exit(1);
}
