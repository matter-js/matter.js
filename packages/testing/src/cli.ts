/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

// Must load first to shim crypto on node 18
import "./util/node-shims.js";

import "./global-definitions.js";

import { ansi, Graph, JsonNotFoundError, Package, Project, ProjectBuilder } from "#tools";
import { clear } from "node:console";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { chip } from "./chip/chip.js";
import { defaultDescriptor, printReport } from "./print-report.js";
import { TestRunner } from "./runner.js";
import { TestDescriptor } from "./test-descriptor.js";

const SHUTDOWN_TIMEOUT_MS = 5_000;

enum TestType {
    esm = "esm",
    cjs = "cjs",
    web = "web",
}

Error.stackTraceLimit = 50;

interface Config {
    allLogs?: boolean;
    pull?: boolean;
    env?: Record<string, unknown>;
}

export async function main(argv = process.argv) {
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", interrupt);

    const testTypes = new Set<TestType>();

    let ls = false;
    let manual = false;

    const args = await yargs(hideBin(argv))
        .usage("Runs tests in packages adhering to matter.js standards.")
        .option("prefix", {
            alias: "p",
            default: ".",
            type: "string",
            describe: "specify directory of package to test",
        })
        .option("web", {
            alias: "w",
            default: false,
            type: "boolean",
            describe: "enable web tests in default test mode",
        })
        .option("spec", {
            type: "array",
            string: true,
            describe: "One or more paths of tests to run",
            default: "./test/**/*{.test,Test}.ts",
        })
        .option("all-logs", { type: "boolean", describe: "Emit log messages in real time" })
        .option("debug", { type: "boolean", describe: "Enable Mocha debugging" })
        .option("environment", { alias: "e", type: "string", describe: "Select named test environment" })
        .option("fgrep", { alias: "f", type: "string", describe: "Only run tests matching this string" })
        .option("force-exit", { type: "boolean", describe: "Force Node to exit after tests complete" })
        .option("grep", { alias: "g", type: "string", describe: "Only run tests matching this regexp" })
        .option("invert", { alias: "i", type: "boolean", describe: "Inverts --grep and --fgrep matches" })
        .option("profile", { type: "boolean", describe: "Write profiling data to build/profiles (node only)" })
        .option("wtf", { type: "boolean", describe: "Enlist wtfnode to detect test leaks" })
        .option("trace-unhandled", { type: "boolean", describe: "Detail unhandled rejections with trace-unhandled" })
        .option("clear", { type: "boolean", describe: "Clear terminal before testing" })
        .option("report", { type: "boolean", describe: "Display test summary after testing" })
        .option("pull", { type: "boolean", describe: "Update containers before testing", default: true })
        .command("*", "run all supported test types")
        .command("esm", "run tests on node (ES6 modules)", () => testTypes.add(TestType.esm))
        .command("cjs", "run tests on node (CommonJS modules)", () => testTypes.add(TestType.cjs))
        .command("web", "run tests in web browser", () => testTypes.add(TestType.web))
        .command("inspect", "display details about tests", () => (ls = true))
        .command("manual", "start web test server and print URL for manual testing", () => {
            testTypes.add(TestType.web);
            manual = true;
        })
        .strict().argv;

    // If spec specified and prefix is default, use the spec file to locate the package
    let packageLocation = args.prefix;
    if (packageLocation === "." && args.spec) {
        const firstSpec = Array.isArray(args.spec) ? args.spec[0] : args.spec;
        packageLocation = firstSpec;
    }

    const builder = new ProjectBuilder();
    const pkg = new Package({ path: packageLocation });

    // Load configuration
    try {
        const found = pkg.findJson(".matter-test.json");
        const config = found.json as Config;

        if ("allLogs" in config && !process.argv.includes("--no-all-logs")) {
            args.allLogs = !!config.allLogs;
        }

        if ("pull" in config && !process.argv.includes("--no-pull")) {
            args.pull = !!config.pull;
        }

        if ("env" in config) {
            for (const key in config.env) {
                process.env[key] = `${config.env[key]}`;
            }
        }
    } catch (e) {
        if (!(e instanceof JsonNotFoundError)) {
            throw e;
        }
    }

    chip.pullBeforeTesting = args.pull;

    // If the location is a workspace, test all packages with test
    if (pkg.isWorkspace) {
        const graph = await Graph.load(pkg);
        await graph.build(builder, false);

        if (args.clear) {
            clear();
        }

        for (const node of graph.nodes) {
            if (!node.pkg.hasTests || node.pkg.json.matter?.test === false) {
                continue;
            }

            await test(node.pkg, true);
        }
    } else {
        const graph = await Graph.forProject(pkg.path);
        if (graph) {
            await graph.build(builder, false);
        } else {
            await builder.build(new Project(pkg));
        }

        if (args.clear) {
            clear();
        }

        await test(pkg, false);
    }

    await chip.close();

    if (args.forceExit) {
        process.exit(0);
    }

    async function test(pkg: Package, detectWeb: boolean) {
        process.chdir(pkg.path);

        if (ls) {
            const progress = pkg.start("Inspecting");
            const runner = new TestRunner(pkg, progress, args);
            const report = await defaultDescriptor(runner);
            progress.close();
            printReport(report, true);
            console.log();
            return;
        }

        // If no test types are specified explicitly, run all enabled types
        const thisTestTypes = new Set(testTypes);
        if (!thisTestTypes.size) {
            if (pkg.supportsEsm) {
                thisTestTypes.add(TestType.esm);
            }
            if (pkg.supportsCjs) {
                thisTestTypes.add(TestType.cjs);
            }
            if (args.web && (!detectWeb || supportsWebTests(pkg))) {
                thisTestTypes.add(TestType.web);
            }
        }

        const progress = pkg.start("Testing");
        const runner = new TestRunner(pkg, progress, args);
        let report: TestDescriptor | undefined;

        if (thisTestTypes.has(TestType.esm)) {
            report = await runner.runNode("esm");
        }

        if (thisTestTypes.has(TestType.cjs)) {
            await runner.runNode("cjs");
        }

        if (thisTestTypes.has(TestType.web)) {
            await runner.runWeb(manual);
        }

        progress.close();

        if (args.report && report) {
            printReport(report);
            console.log();
        }
    }

    // Do not hang indefinitely if tests do not clean up after themselves properly.  Instead print error and exit with
    // non-zero status code
    const timeout = setTimeout(() => {
        console.error(`Error: Tests passed but process did not exit cleanly after ${SHUTDOWN_TIMEOUT_MS / 1000}s.`);
        process.exit(101);
    }, SHUTDOWN_TIMEOUT_MS);
    timeout.unref();
}

function supportsWebTests(pkg: Package) {
    const testScript = pkg.json?.scripts?.test;
    if (typeof testScript !== "string") {
        return false;
    }
    return testScript.split(" ").includes("-w");
}

function interrupt() {
    process.stderr.write(`💥 ${ansi.red("Aborted")}\n`);
    process.exit(1);
}

if (typeof MatterHooks !== "undefined") {
    MatterHooks.interrupt = interrupt;
}
