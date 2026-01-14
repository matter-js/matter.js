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
    const stepMatch = line.match(/^(.*\s\*{5})\s+(Test Step \d+)\s+:(?:\s+(\S.*)|\S.*)$/);
    if (stepMatch) {
        const [, prefix, stepNum, stepName] = stepMatch;
        step(stepName);
        return `${prefix} ${colors.reset.greenBright(`${colors.bold(stepNum)} : ${stepName}`)}`;
    }
    return line;
}
