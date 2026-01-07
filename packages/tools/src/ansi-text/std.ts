/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { stderr, stdout } from "node:process";
import { Printer } from "./printer.js";
import { ansi } from "./text-builder.js";
import { TextWriter } from "./text-writer.js";

const DEFAULT_WRAP_PREFIX = `  ${ansi.dim}⤷${ansi.not.dim} `;

export namespace std {
    /**
     * Writer that writes to Node's stdout.
     */
    export const out = Printer(new TextWriter(text => stdout.write(text), { terminalWidth: stdout.columns }), {
        wrap: { wrapPrefix: DEFAULT_WRAP_PREFIX, preserveSpace: true },
    });

    /**
     * Writer that writes to Node's stdout.
     */
    export const err = Printer(new TextWriter(text => stderr.write(text), { terminalWidth: stderr.columns }), {
        wrap: { wrapPrefix: DEFAULT_WRAP_PREFIX, preserveSpace: true },
    });
}
