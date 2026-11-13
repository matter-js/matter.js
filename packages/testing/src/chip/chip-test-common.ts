/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import colors from "ansi-colors";

/**
 * Parses the step marker common to both CHIP test types.
 *
 * Adds coloring to improve visibility and updates the runner's state.
 */
export function parseStep(line: string, step: (name: string) => void) {
    // `\S+`, not `\d+`: MatterBaseTest.print_step (matter_testing.py) accepts any step identifier, and
    // named-step TCs (e.g. TC-SC-3.5's "1a"/"1b"/"1c") print alphanumeric ones, not just plain numbers.
    const stepMatch = line.match(/^(.*\s\*{5})\s+(Test Step \S+)\s+:(?:\s+(\S.*)|\S.*)$/);
    if (stepMatch) {
        const [, prefix, stepNum, stepName] = stepMatch;
        step(stepName);
        return `${prefix} ${colors.reset.greenBright(`${colors.bold(stepNum)} : ${stepName}`)}`;
    }
    return line;
}

/**
 * The step a line of a CHIP python test reports as skipped, from the line MatterBaseTest.mark_current_step_skipped
 * (matter_testing.py) logs, also for each step of mark_step_range_skipped.  The python runner writes each log line
 * more than once, so callers count distinct steps.
 */
export function skippedStepOf(line: string) {
    return line.match(/\*{4} Skipping: (\S+)/)?.[1];
}

/**
 * The verdict a CHIP python test states in its output, fed one line at a time.  A run executes one test method, so
 * its output carries at most one mobly result line (`[Test] <name> PASS|SKIP|…`).
 *
 * A test that skips itself, for example when `run_if_endpoint_matches` finds no endpoint with the feature it needs,
 * logs `[Test] <name> SKIP` and exits 0 without a pass line.
 */
export class PythonTestOutcome {
    #passed = false;
    #skipped = false;

    observe(line: string) {
        if (line.indexOf("Final result: PASS") !== -1) {
            // Old format
            this.#passed = true;
        } else if (/\[Test\]\s+\S+\s+PASS$/.test(line)) {
            // New format
            this.#passed = true;
        } else if (/\[Test\]\s+\S+\s+SKIP$/.test(line)) {
            this.#skipped = true;
        }
    }

    get passed() {
        return this.#passed;
    }

    /** The test skipped itself and did not pass. */
    get skipped() {
        return this.#skipped && !this.#passed;
    }
}

/**
 * Thrown when a CHIP test skipped itself rather than passing or failing, so the harness reports it as skipped.
 */
export class ChipTestSkippedError extends Error {
    constructor(test: string) {
        super(`CHIP test ${test} skipped itself`);
    }
}
