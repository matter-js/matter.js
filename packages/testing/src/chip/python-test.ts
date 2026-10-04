/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import colors from "ansi-colors";
import { basename, join } from "node:path";
import { Subject } from "../device/subject.js";
import { BaseTest } from "../device/test.js";
import type { Container } from "../docker/container.js";
import { Terminal } from "../docker/terminal.js";
import { TestFileDescriptor } from "../test-descriptor.js";
import { parseStep } from "./chip-test-common.js";
import { Constants, ContainerPaths } from "./config.js";
import { PicsSource } from "./pics/source.js";
import { RestartFlagMonitor } from "./restart-flag-monitor.js";

/**
 * The seconds a python test script allows its own test body, from the `default_timeout` property mobly
 * reads. `undefined` where the script declares none, or declares it as anything but a product of whole
 * numbers, in which case {@link MATTER_TEST_DEFAULT_TIMEOUT} applies.
 */
function pythonTestTimeout(source: string): number | undefined {
    const declared = source.match(
        /def\s+default_timeout\s*\([^)]*\)[^\n:]*:\s*(?:\n\s*"""[^]*?"""\s*)?\n\s*return\s+([\d\s*]+)/,
    );
    if (declared === null) {
        return undefined;
    }

    const seconds = declared[1].split("*").reduce((product, factor) => product * Number.parseInt(factor.trim(), 10), 1);

    return Number.isSafeInteger(seconds) && seconds > 0 ? seconds : undefined;
}

/** What `MatterBaseTest.default_timeout` returns for a script that states no timeout of its own. */
const MATTER_TEST_DEFAULT_TIMEOUT = 90;

export class PythonTest extends BaseTest {
    #restartFlagHostDir?: string;

    constructor(descriptor: TestFileDescriptor, container: Container, restartFlagHostDir?: string) {
        super(descriptor, container);
        this.#restartFlagHostDir = restartFlagHostDir;
    }

    /**
     * The seconds the script this test runs allows its whole test body, including setup and every
     * prompt it makes. Mobly ends the script when they are up, so a harness that drives the script
     * through its prompts has until then to reach a verdict of its own.
     */
    async declaredTimeout(): Promise<number> {
        const source = await this.container.read(this.descriptor.path);
        if (typeof source !== "string") {
            return MATTER_TEST_DEFAULT_TIMEOUT;
        }
        return pythonTestTimeout(source) ?? MATTER_TEST_DEFAULT_TIMEOUT;
    }

    /**
     * Python commissioning logic is cleverly hidden in:
     *
     *     connectedhomeip/src/python_testing/matter/testing/matter_testing.py
     */
    async initializeSubject(subject: Subject) {
        const { kind, passcode, discriminator, network } = subject.commissioning;

        const command = [
            "python3",
            ContainerPaths.pythonCommissioner,

            // Python commissioning is only available in test implementations so our "commissioner" is just
            // a random test.  Disable the actual test from running
            "--commission-only",

            "--passcode",
            `${passcode}`,

            "--discriminator",
            `${discriminator}`,
        ];

        switch (kind) {
            case "on-network":
                command.push("--commissioning-method", "on-network");
                break;

            case "ble-wifi":
                if (network?.kind !== "wifi") {
                    throw new Error(`Must specify WiFi network for commissioning of subject ${subject.id}`);
                }
                command.push(
                    "--commissioning-method",
                    "ble-wifi",

                    "--wifi-ssid",
                    network.ssid,

                    "--wifi-passphrase",
                    network.password,
                );
                break;

            case "ble-thread":
                if (network?.kind !== "thread") {
                    throw new Error(`Must specify Thread network for commissioning of subject ${subject.id}`);
                }
                command.push(
                    "--commissioning-method",
                    "ble-thread",

                    "--thread-dataset-hex",
                    network.datasetHex,
                );
                break;

            default:
                throw new Error(`Unknown commissioning method ${subject.commissioning.kind} for subject ${subject.id}`);
        }

        const terminal = await this.container.exec(command, Terminal.Line, {
            cwd: "/tmp",
        });

        try {
            for await (const line of terminal) {
                MockLogger.injectExternalMessage("PAIR", spiffy(line));
            }
        } catch (e) {
            throw new Error("Error pairing test app", { cause: e });
        }
    }

    async invoke(subject: Subject, step: (title: string) => void, args: string[], uncommissioned: boolean) {
        let monitor: RestartFlagMonitor | undefined;
        if (this.#restartFlagHostDir) {
            const hostFlagPath = join(this.#restartFlagHostDir, basename(Constants.RestartFlagFile));
            monitor = new RestartFlagMonitor(hostFlagPath, subject);
            monitor.start();
        }

        let testError: unknown;
        try {
            await this.#runPythonTest(subject, step, args, uncommissioned);
        } catch (e) {
            testError = e;
        }

        // Stop monitor outside try/finally to avoid unsafe-finally lint violation.
        // If both test and monitor fail, the test error takes priority.
        try {
            await monitor?.stop();
        } catch (e) {
            if (testError === undefined) {
                testError = e;
            } else {
                console.warn("Failed to stop restart flag monitor after test failure:", e);
            }
        }

        if (testError !== undefined) {
            throw testError;
        }
    }

    async #runPythonTest(subject: Subject, step: (title: string) => void, args: string[], uncommissioned: boolean) {
        const terminal = await this.container.exec(
            await createCommand(this.descriptor, this.container, subject, args, uncommissioned),
            Terminal.Line,
            {
                cwd: "/tmp",
            },
        );

        let passed = false;
        for await (let line of terminal) {
            line = parseStep(line, step);

            if (line.indexOf("Final result: PASS") !== -1) {
                // Old format
                passed = true;
            } else if (line.match(/\[Test\]\s+\S+\s+PASS$/)) {
                // New format
                passed = true;
            }

            MockLogger.injectExternalMessage("CHIP", spiffy(line));
        }

        if (!passed) {
            throw new Error("Python test exited without error but did not indicate successful test");
        }
    }
}

/**
 * Upgrade logging output with consistency and colors.
 */
export function spiffy(line: string) {
    let timestamp = "";
    let level = "";
    let facility = "";
    let message = line;

    line = line.trim();

    const logFormat1 = line.match(/^\[MatterTest\] (\d\d-\d\d \d\d:\d\d:\d\d\.\d\d\d) ([A-Z]+) (.*)$/);
    if (logFormat1) {
        [, timestamp, level, message] = logFormat1;
    } else {
        const logFormat2 = line.match(/^([A-Z]+):([^:]+):(.*)$/);
        if (logFormat2) {
            [, level, facility, message] = logFormat2;
        } else {
            // OMFG why do they hate us
            const logFormat3 = line.match(/^\[(\d+\.\d+)\](\[[^\]]+\]) ([^ ]+): (.*)$/);
            if (logFormat3) {
                let someNumbersOfUnknownMeaning;
                [, timestamp, someNumbersOfUnknownMeaning, facility, message] = logFormat3;
                message = `${someNumbersOfUnknownMeaning} ${message}`;
            }
        }
    }

    if (message[0] === "*") {
        // Error test results are boxed using asterisks; make them stand out
        const errorMatch = message.match(/\*(.*Test\s+)(\S+)(\s+failed for the following reason:.*)/);
        if (errorMatch) {
            const [, prefix, name, suffix] = [...errorMatch];
            message = `*${colors.redBright(`${prefix}`)}${colors.redBright.bold(name)}${colors.redBright(suffix)}`;
        }
        message = colors.reset(message);
    } else if (level === "WARN") {
        message = colors.yellow(message);
    } else if (level === "ERROR") {
        message = colors.red(message);
    } else if (level === "CRITICAL" || level === "FATAL") {
        message = colors.red.bold(message);
    }
    // CHIP is very verbose at INFO so just leave it as default dim

    if (facility) {
        message = `${colors.bold(facility)} ${message}`;
    }

    return `${timestamp.padEnd(19)}${level.padEnd(9)}${message}`;
}

/**
 * Each Python test includes YAML defining arguments it expects in CI.  Most of these arguments are copy and pasted
 * boilerplate that we ignore, have reasonable defaults or that we set (e.g. PICS file).  Some however must be present
 * or the test will not run.  So we must extract these arguments to pass into the script.
 *
 * A program defining mandatory arguments to itself seems silly but we work with what we've got amiright?
 */
export async function createCommand(
    descriptor: TestFileDescriptor,
    container: Container,
    subject: Subject,
    extraArgs: string[],
    uncommissioned: boolean,
) {
    const command = ["python3", descriptor.path, ...Constants.PythonRunnerArgs];

    const args = scriptArgsOf(descriptor);

    command.push(...args, ...extraArgs);

    // Uncommissioned subjects read the setup code in setup_class (self-commission, or assert it like TC_SC_7_1).
    // The QR pairing code encodes discriminator + passcode, so it satisfies both get_setup_payload_info_config and
    // setup-code tests that reject bare discriminator/passcode.
    if (uncommissioned && !command.includes("--qr-code")) {
        command.push("--qr-code", subject.commissioning.qrPairingCode);
    }

    if (!command.includes("--PICS")) {
        command.push("--PICS", await PicsSource.install(container, subject.pics));
    }

    const qrCodePos = command.indexOf("--qr-code");
    if (qrCodePos !== -1) {
        command[qrCodePos + 1] = subject.commissioning.qrPairingCode;
    }

    return command;
}

function scriptArgsOf(descriptor: TestFileDescriptor) {
    let args: string[] | undefined;

    const predefined = descriptor.config?.["script-args"];
    if (typeof predefined === "string") {
        args = predefined.trim().split(/\s+/);
    } else if (Array.isArray(predefined)) {
        args = [...predefined];
    }

    if (descriptor.subpath) {
        (args ?? (args = [])).push("--test-case", descriptor.subpath);
    }

    return args ?? [];
}
