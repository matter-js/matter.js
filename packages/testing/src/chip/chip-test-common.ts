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
