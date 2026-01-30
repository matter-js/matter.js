/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ansi, Printer, STATUS_ICON_FAILURE } from "#tools";
import { FailureDetail } from "./failure-detail.js";
import { TextDiff } from "./text-diff.js";

const BEGIN_ERROR = `${ansi.red}┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┅${ansi.not.red}`;
const OUTER_PREFIX = `${ansi.red}┃  ${ansi.not.red}`;
const INNER_PREFIX = `${ansi.dim}┆  ${ansi.not.dim}`;
const END_ERROR = `${ansi.red}┗━┅${ansi.not.red}`;

export namespace FailureReporter {
    export function report(out: Printer, failure: FailureDetail, title: string) {
        out(BEGIN_ERROR, "\n", OUTER_PREFIX, "\n");

        out.state({ linePrefix: OUTER_PREFIX }, () => {
            out(ansi.bold.red(STATUS_ICON_FAILURE), " ", title, "\n");
            dumpDetails(out, failure);
        });

        out(OUTER_PREFIX, "\n", END_ERROR, "\n");
    }
}

function dumpCause(out: Printer, failure: FailureDetail) {
    out.state({ linePrefix: INNER_PREFIX }, () => {
        dumpDetails(out, failure);
    });
}

function dumpDetails(
    out: Printer,
    { message, id, actual, expected, stack, cause, errors, secondary, logs, diagnostics }: FailureDetail,
) {
    out("\n", ansi.bright.red(id ? `[${ansi.bold(id)}] ${message}` : message), "\n");

    if (actual !== undefined && expected !== undefined) {
        out("\n");
        out.state({ linePrefix: "    " }, () => out(TextDiff(actual, expected)));
        out("\n");
    }

    if (stack) {
        out("\n");
        out.state({ linePrefix: "  " }, () => out(stack));
        out("\n");
    }

    if (cause) {
        out("\n", ansi.bold("Caused by:"), "\n");
        dumpCause(out, cause);
    }

    if (errors?.length) {
        let num = 0;
        for (const cause of errors) {
            out("\n", ansi.bold(`Cause #${++num}:`), "\n");
            dumpCause(out, cause);
        }
    }

    if (secondary) {
        out("\n", ansi.bold("Secondary error during disposal:"), "\n");
        dumpCause(out, secondary);
    }

    if (logs) {
        out("\n", logs, "\n");
    }

    if (diagnostics) {
        out("\n", ansi.bold("Process state at timeout:"), "\n", diagnostics, "\n");
    }
}
