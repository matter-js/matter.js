/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { NodeJsStyleInspectable } from "#log/NodeJsStyleInspectable.js";
import type { MaybePromise } from "#util/Promises.js";
import { decamelize } from "#util/String.js";
import { errorOf } from "./util/Error.js";

const codes = new WeakMap<{}, string>();

/**
 * Error base class for all errors thrown by this library.
 */
export class MatterError extends Error {
    /**
     * Convert the error to formatted text.
     *
     * matter.js encodes errors with modern JS features including {@link Error#cause} and {@link AggregateError#errors}
     * subfields.  You can use this function to ensure all error details are presented regardless of environment.
     */
    format(format: "plain" | "ansi" | "html" = "plain", indents = 0) {
        let formatterFor = MatterError.formatterFor;
        if (typeof formatterFor !== "function") {
            formatterFor = MatterError.defaultFormatterFactory;
        }

        let formatter = formatterFor(format);
        if (typeof formatter !== "function") {
            formatter = fallbackFormatter;
        }

        let result = formatter(this, indents);
        if (typeof result !== "string") {
            result = `${result}`;
        }

        return result as string;
    }

    /**
     * A unique textual identifier for the error.
     */
    get id() {
        return MatterError.idFor(this.constructor);
    }

    /**
     * A unique textual identifier for the error.
     */
    static get id() {
        return MatterError.idFor(this);
    }

    /**
     * Obtain matter.js-style error ID for given error constructor.
     */
    static idFor(type: { name: string }) {
        let id = codes.get(type);

        if (id === undefined) {
            let name = type.name;
            if (name.endsWith("Error")) {
                name = name.substring(0, name.length - 5);
            }

            if (name.startsWith("Matter")) {
                name = name.substring(6);
            }

            id = decamelize(name);
            if (id === "") {
                id = "general";
            }

            codes.set(type, id);
        }

        return id;
    }

    /**
     * Rethrow an error unless it is an instance of this class.
     */
    static accept<T extends MatterError>(this: new (...args: any[]) => T, error: unknown): asserts error is T {
        if (error instanceof this) {
            return;
        }
        throw error;
    }

    /**
     * Rethrow an error if it is an instance of this class.
     */
    static reject(error: unknown): void {
        if (error instanceof this) {
            throw error;
        }
    }

    /**
     * The fallback formatter factory.  This produces a limited plaintext formatter.
     */
    static defaultFormatterFactory = () => fallbackFormatter;

    /**
     * The error formatter factory.  The default formatter is replaced by Matter.js in ./Format.ts.
     */
    static formatterFor: (formatName: string) => (value: unknown, indents?: number) => unknown =
        MatterError.defaultFormatterFactory;

    // TODO - this is probably correct; MatterAggregateError should be typeof MatterError.  Need to diagnose some test
    // breakage before enabling though
    // static [Symbol.hasInstance](instance: unknown) {
    //     if (instance instanceof MatterAggregateError) {
    //         return true;
    //     }
    //     return Error[Symbol.hasInstance](instance);
    // }
}

/**
 * Error thrown when a Platform specific implementation was not added and so a provider (Network, Time, Crypto, etc)
 * is not available.
 */
export class NoProviderError extends MatterError {}

/**
 * Error thrown when an internal error occurs like unexpected cases or missing data that should be there. Please
 * report such errors.
 */
export class InternalError extends MatterError {}

/** Error thrown when a feature is not implemented yet. Please report such errors. */
export class NotImplementedError extends InternalError {}

/** Error thrown when an unexpected case in the matter flow is encountered. Please report such errors. */
export class MatterFlowError extends MatterError {}

/** Error thrown when an unexpected data is encountered. Please report such errors. */
export class UnexpectedDataError extends MatterError {}

/**
 * Error thrown if most likely an implementation error is detected. Please check and correct your implementation and
 * provided data. if you are sure your code is correct please report the issue.
 */
export class ImplementationError extends MatterError {}

/**
 * Thrown when a dynamic component cannot be loaded.
 */
export class ImportError extends MatterError {}

/**
 * Thrown for write attempts against immutable data.
 */
export class ReadOnlyError extends ImplementationError {
    constructor(message = "This view is read-only") {
        super(message);
    }
}

/**
 * Thrown for errors that have multiple underlying causes.
 */
export class MatterAggregateError extends AggregateError {
    constructor(causes: Iterable<unknown>, message?: string) {
        causes = [...causes].map(errorOf);
        super(causes, message);
    }

    /**
     * A unique textual identifier for the error.
     */
    get id() {
        return MatterError.idFor(this.constructor);
    }

    /**
     * A unique textual identifier for the error.
     */
    static get id() {
        return MatterError.idFor(this);
    }

    /**
     * Add causes without stack traces.
     *
     * This is useful to create a compact representation if all child errors originate externally or from the same
     * logical location as the parent error.
     */
    addStackless(error: Error) {
        error.stack = undefined;
        this.errors.push(error);
    }

    // TODO - see comment on MatterError.  If that one is correct this is incorrect
    static override [Symbol.hasInstance](instance: unknown) {
        if (instance instanceof MatterError) {
            return true;
        }
        return AggregateError[Symbol.hasInstance](instance);
    }

    /**
     * Wait for all promises to settle and throw an error if any of them reject as MatterAggregateError
     * (or extended class). Promise results are not returned.
     */
    static async allSettled<T = unknown>(
        promises: Iterable<MaybePromise<T>>,
        message = "Errors happened",
    ): Promise<T[]> {
        const results = await Promise.allSettled(promises);
        const errors = results.filter(result => result.status === "rejected").map(result => result.reason);

        if (errors.length) {
            throw new this(errors, message);
        }
        return (results as PromiseFulfilledResult<T>[]).map(result => result.value);
    }

    format = MatterError.prototype.format;
}

/**
 * It's never reasonable to fail to present error information so we include this rudimentary fallback error formatter.
 */
function fallbackFormatter(value: unknown, indents = 0) {
    if (value === undefined || value === null) {
        return `${value}`;
    }

    function formatOne(value: unknown, indents: number, messagePrefix: string) {
        const { message, stack, cause, errors } = value as {
            message?: unknown;
            stack?: unknown;
            cause?: unknown;
            errors?: unknown;
        };

        let indent;
        if (typeof indents !== "number" || indents < 0) {
            indent = "";
        } else {
            indent = "  ".repeat(indents);
        }

        const buffer = [`${indent}${messagePrefix}${message ?? "(unknown error)"}`];

        if (stack !== undefined && stack !== null) {
            const frames = stack.toString().split("\n");
            frames.shift();
            buffer.push(...frames.map(f => `${indent}  ${f.trim()}`));
        }

        if (cause !== undefined) {
            buffer.push(formatOne(cause, indents, "Caused by: "));
        }

        if (typeof (errors as Iterable<unknown> | undefined)?.[Symbol.iterator] === "function") {
            let causeNumber = 0;
            for (const error of errors as Iterable<unknown>) {
                buffer.push(formatOne(error, indents + 1, `Cause #${causeNumber++}: `));
            }
        }

        return buffer.join("\n");
    }

    return formatOne(value, indents, "");
}

/**
 * Indicate an asynchronous operation was canceled.
 */
export class CanceledError extends MatterError {
    constructor(message = "Operation canceled", options?: ErrorOptions) {
        super(message, options);
    }
}

/**
 * Indicates an asynchronous operation was canceled due to timeout.
 */
export class TimeoutError extends MatterError {
    constructor(message = "Operation timed out", options?: ErrorOptions) {
        super(message, options);
    }
}

/**
 * Thrown on abort when there is not an underlying error.
 */
export class AbortedError extends CanceledError {
    constructor(message = "This operation was aborted", options?: ErrorOptions) {
        super(message, options);
    }

    /**
     * Determine whether a cause signifies abort.
     *
     * We include {@link DOMException} with name "AbortError" which is the standard error thrown if you invoke
     * {@link AbortController#abort} without a cause.
     */
    static is(cause: unknown) {
        return cause instanceof AbortedError || (cause instanceof DOMException && cause.name === "AbortError");
    }

    /**
     * Accept both {@link AbortedError} and {@link DOMException} with name "AbortError".
     */
    static override accept(cause: unknown) {
        if (AbortedError.is(cause)) {
            return;
        }

        return super.accept(cause);
    }
}

/**
 * Node.js-style object inspection.
 *
 * Node's default inspection only prevents two levels of depth which may hide critical information.  It's also
 * considerably more verbose than native matter.js formatting.  We therefore offer this custom implementation.
 *
 * Note that this conforms to Node's API but is not dependent on Node.
 */
function inspector(this: MatterError, depth: number, options: NodeJsStyleInspectable.Options) {
    const formatterFor = MatterError.formatterFor;
    if (typeof formatterFor !== "function") {
        return this;
    }

    const format = formatterFor(options.colors ? "ansi" : "plain");
    if (typeof format !== "function") {
        return this;
    }

    return format(this, depth);
}

NodeJsStyleInspectable(MatterError.prototype, inspector);
NodeJsStyleInspectable(MatterAggregateError.prototype, inspector);
Object.defineProperty(MatterAggregateError.prototype, "format", {
    value: MatterError.prototype.format,
    configurable: true,
    writable: true,
    enumerable: false,
});
