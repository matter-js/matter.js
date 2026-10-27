/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Environment, LogFormat, Logger } from "@matter/general";

export interface ConsoleStreams {
    stdout?: { isTTY?: boolean };
    stderr?: { isTTY?: boolean };
}

/**
 * Colorize console logs only when every console stream goes to a terminal; warnings and errors go to stderr, the rest
 * to stdout, and both use one format.
 *
 * An explicit `log.format` variable, or a non-default {@link Logger.format} set before the environment starts, is kept.
 * A `Logger.format` of plain set that early cannot be told from the default and is colorized on a terminal.
 */
export function configureLogFormat(
    env: Environment,
    { stdout, stderr }: ConsoleStreams = { stdout: process.stdout, stderr: process.stderr },
) {
    if (!env.vars.has("log.format") && Logger.format === LogFormat.PLAIN && stdout?.isTTY && stderr?.isTTY) {
        env.vars.set("log.format", LogFormat.ANSI);
    }
}
