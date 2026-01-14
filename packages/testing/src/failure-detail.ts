/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FailureDetail {
    message: string;
    id?: string;
    stack?: string;
    stackLines?: string[];
    actual?: string;
    expected?: string;
    logs?: string;
    cause?: FailureDetail;
    secondary?: FailureDetail;
    errors?: FailureDetail[];
}

/**
 * Captures all pertinent information about a failed test.
 */
export function FailureDetail(error: any, id?: string, logs?: string[], parentStack?: string[]) {
    const { message, stack, stackLines, cause, errors, secondary } = parseError(error, parentStack);
    const result = { message } as FailureDetail;

    if (stack) {
        result.stack = stack;
    }
    if (id) {
        result.id = id;
    }
    if (logs?.length) {
        result.logs = logs.join("\n");
    }
    if (cause) {
        result.cause = cause;
    }
    if (secondary) {
        result.secondary = secondary;
    }
    if (errors) {
        result.errors = errors;
    }
    if (stackLines) {
        result.stackLines = stackLines;
    }

    const { actual, expected } = error;
    if (actual) {
        result.actual = actual;
    }
    if (expected) {
        result.expected = expected;
    }

    return result;
}

function messageAndStackFor(
    error: Error,
    parentStack?: string[],
): { message: string; id?: string; stack?: string; stackLines?: string[] } {
    // If an error formatting hook is installed, use that
    if (MatterHooks?.messageAndStackFor) {
        return MatterHooks.messageAndStackFor(error, parentStack);
    }

    // Fallback message formatting
    let message, stack;
    if (error === undefined || error === null) {
        message = `(error is ${error})`;
    } else {
        message = error.message;
    }

    if (error.stack) {
        let lines = error.stack.trim().split("\n");
        if (!message) {
            message = lines[0];
        }
        lines = lines.filter(line => line.match(/:\d+:\d+\)?/));
        if (lines.length) {
            stack = lines.map(line => line.trim()).join("\n");
        }
    }

    if (!message) {
        message = error.toString();
    }

    return { message, stack };
}

function parseError(error: Error, parentStack?: string[]) {
    let secondary: FailureDetail | undefined;
    if ("error" in error && "suppressed" in error) {
        secondary = FailureDetail(error.error);
        error = error.suppressed as Error;
    }

    const { message, id, stack, stackLines } = messageAndStackFor(error, parentStack);

    let cause: FailureDetail | undefined, errors: FailureDetail[] | undefined;

    const errorCause = error.cause;
    if (errorCause) {
        cause = FailureDetail(errorCause, id, undefined, stackLines);
    }

    const errorErrors = (error as AggregateError).errors;
    if (Array.isArray(errorErrors)) {
        errors = errorErrors.map(e => FailureDetail(e, id, undefined, stackLines));
    }

    return { message, id, stack, stackLines, cause, errors, secondary };
}
