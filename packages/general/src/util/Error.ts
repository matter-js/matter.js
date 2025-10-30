/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { AbortedError } from "#MatterError.js";
import type { Constructable } from "./Construction.js";
import { ClassExtends } from "./Type.js";

/** If the cause has a "message" field, treat as an Error */
function considerAsError(error: unknown): error is Error {
    return (error as Error).message !== undefined;
}

export function asError(e: any): Error {
    if (considerAsError(e)) {
        // AbortController defaults to a DOMException which isn't ideal; translate here
        if (e instanceof DOMException && e.name === "AbortError") {
            const aborted = new AbortedError(e.message);
            aborted.stack = e.stack;
            aborted.cause = e.cause;
            return aborted;
        }

        return e;
    }
    return new Error(e?.toString() ?? "Unknown error");
}

/**
 * Ensure that a cause is an error object.
 *
 * We consider anything with a "message" property to be a reasonable error object.
 */
export function errorOf(cause: unknown): Error {
    // If the cause is a Constructable, use its construction error
    if ((cause as Constructable)?.construction?.error) {
        cause = (cause as Constructable)?.construction.error;
    }

    // If the cause is indeterminate we fall back to the helpful "Unknown error"
    if (cause === undefined || cause === null) {
        return Error("Unknown error");
    }

    if (considerAsError(cause)) {
        return cause;
    }

    // Otherwise create a new error using the original cause as the message
    return new Error(cause.toString());
}

/**
 * Repacks an error object as a different error class.
 * The error stack is copied over from the original error instance
 */
export function repackErrorAs<E extends ClassExtends<Error>, I extends InstanceType<E>>(
    error: unknown,
    repackAsErrorClass: E,
    message?: string,
): I {
    if (error instanceof repackAsErrorClass) {
        return error as I;
    }

    if (considerAsError(error)) {
        const repackedError = new repackAsErrorClass(message ?? error.message);
        repackedError.cause = error;
        return repackedError as I;
    }

    throw new TypeError("Cannot repackage non-Error object");
}
