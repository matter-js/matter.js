/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Duration } from "#time/Duration.js";
import { Time } from "#time/Time.js";
import { Timestamp } from "#time/Timestamp.js";
import { Millis } from "#time/TimeUnit.js";
import { Bytes } from "#util/Bytes.js";
import type { Lifecycle } from "../util/Lifecycle.js";
import { DiagnosticPresentation } from "./DiagnosticPresentation.js";
import { LogLevel } from "./LogLevel.js";

let errorCollector: undefined | ((error: {}) => boolean);

/**
 * Logged values may implement this interface to customize presentation.
 *
 * You can use the utility functions such as {@link Diagnostic.dict} to create
 * Diagnostics from common value types.
 */
export type Diagnostic = {
    readonly [Diagnostic.presentation]?: Diagnostic.Presentation | Lifecycle.Status;
    readonly [Diagnostic.value]?: unknown;
};

/**
 * Create a diagnostic giving a value a specific presentation.
 */
export function Diagnostic(presentation: Diagnostic.Presentation | Lifecycle.Status, value: unknown): Diagnostic {
    return {
        [Diagnostic.presentation]: presentation,
        [Diagnostic.value]: value,
    };
}

/**
 * An extension of {@link Error} with additional diagnostic fields.
 */
export interface DiagnosticError extends Error {
    /**
     * The string used to tag formatted messages.
     */
    id?: string;

    /**
     * The origin of the error.
     */
    path?: Diagnostic;
}

export namespace Diagnostic {
    export type Presentation = `${DiagnosticPresentation}`;
    export const Presentation = DiagnosticPresentation;

    export const presentation = DiagnosticPresentation.presentation;
    export const value = DiagnosticPresentation.value;

    export function presentationOf(diagnostic: unknown) {
        return (diagnostic as Diagnostic)?.[Diagnostic.presentation];
    }

    export function valueOf(diagnostic: unknown) {
        return (diagnostic as Diagnostic)?.[Diagnostic.value];
    }

    export interface Context {
        run<T>(fn: () => T): T;
    }

    /**
     * Diagnostic context provides contextual information that affects formatting.
     */
    export function Context(): Context {
        let errorsCollected: undefined | {}[];
        const errorsReported = new WeakSet<{}>();

        const thisErrorCollector = (error: {}) => {
            // Indicate to caller this error is already reported
            if (errorsReported.has(error)) {
                return true;
            }

            // Collect the error so it can be marked as reported if a contextual operation succeeds
            if (errorsCollected) {
                errorsCollected.push(error);
            } else {
                errorsCollected = [error];
            }

            // Indicate to caller this error is as yet unreported
            return false;
        };

        return {
            run(fn) {
                const originalErrorCollector = errorCollector;
                try {
                    errorCollector = thisErrorCollector;

                    const result = fn();

                    if (errorsCollected) {
                        for (const error of errorsCollected) {
                            errorsReported.add(error);
                        }
                        errorsCollected = undefined;
                    }

                    return result;
                } finally {
                    errorCollector = originalErrorCollector;
                }
            },
        };
    }

    export interface Message {
        [presentation]?: "message";
        now: Date;
        level: LogLevel;
        facility: string;
        prefix: string;
        values: unknown[];
    }

    /**
     * Create an object representing a log message.
     */
    export function message(value: Partial<Message>): Message {
        const { now, level, facility, prefix: nestingPrefix, values } = value;

        return {
            [presentation]: Presentation.Message,
            now: now ?? new Date(),
            level: level ?? LogLevel.INFO,
            facility: facility ?? "Diagnostic",
            prefix: nestingPrefix ?? "",
            values: values ?? [],
        } satisfies Message;
    }

    /**
     * Create a value presented emphatically.
     */
    export function strong(value: unknown) {
        return Diagnostic("strong", value);
    }

    /**
     * Create a value presented less emphatically than the default.
     */
    export function weak(value: unknown) {
        return Diagnostic("weak", value);
    }

    /**
     * Create a value presented as key
     */
    export function flag(value: string) {
        return Diagnostic("flag", value);
    }

    /**
     * Create a value identifying the source of a diagnostic event.
     *
     * Conventions for via:
     *
     *   - Use padded hex for random(ish) fixed-width numbers
     *
     *   - If there is an ID associated with a name, associate using "name#id"
     *
     *   - If there are subcomponents, associate with ":" (e.g. "sessionId:exchangeId:messageId")
     *
     *   - Use "/" as a separator if there are distinct subcomponents commonly delineated with ":"
     */
    export function via(value: string) {
        if (Diagnostic.presentationOf(value)) {
            return value;
        }
        const via = new String(value);
        Object.defineProperty(via, presentation, { value: Presentation.Via });
        return via as string;
    }

    /**
     * Create a value identifying a resource that was added.
     */
    export function added(value: unknown) {
        return Diagnostic("added", value);
    }

    /**
     * Create a value identifying a resource that was removed.
     */
    export function deleted(value: unknown) {
        return Diagnostic("deleted", value);
    }

    /**
     * A node in a diagnostic tree.  Top-level diagnostic sources registered with DiagnosticSource should present as
     * nodes.
     */
    export function node(icon: string, label: unknown, detail: { self?: unknown; children?: unknown[] }) {
        const result = [icon, Diagnostic.strong(label)] as unknown[];
        if (detail?.self !== undefined) {
            result.push(detail.self);
        }
        if (detail?.children !== undefined) {
            result.push(Diagnostic.list(detail.children));
        }
        return result;
    }

    /**
     * Create a value presenting as a list of separate lines.
     */
    export function list(value: Iterable<unknown>) {
        return Diagnostic("list", value);
    }

    /**
     * Create a value presenting as segments of the same string without intervening spaces.
     */
    export function squash(...values: unknown[]) {
        return Diagnostic("squash", values);
    }

    /**
     * Create a K/V map that presents with formatted keys.
     */
    export function dict(entries: object, suppressUndefinedValues = true): Record<string, unknown> & Diagnostic {
        const result: any = {
            ...entries,
            [presentation]: "dictionary",
        };
        if (suppressUndefinedValues) {
            for (const key in result) {
                if (result[key] === undefined) {
                    delete result[key];
                }
            }
        }
        return result;
    }

    /**
     * Create a Diagnostic for an error.
     */
    export function error(error: unknown) {
        return formatError(error);
    }

    /**
     * Create a diagnostic for error messages that may have a code.
     *
     * Useful for errors when we don't want to present the stack trace.
     */
    export function errorMessage({ id, message, path }: { id?: string; message: string; path?: unknown }): unknown {
        if (id === undefined && path === undefined) {
            return Diagnostic("error", message);
        }

        const diagnostic = Array<unknown>();

        if (id) {
            diagnostic.push(Diagnostic.squash("[", Diagnostic.strong(id), "]"));
        }

        if (path) {
            diagnostic.push(Diagnostic.squash(path, ":"));
        }

        diagnostic.push(message);

        return Diagnostic("error", diagnostic);
    }

    /**
     * Create a diagnostic with a specific {@link Lifecycle}.
     */
    export function lifecycle(status: Lifecycle.Status, value: unknown) {
        return Diagnostic(status, value);
    }

    /**
     * Create a diagnostic for a {@link Lifecycle.Map}.
     */
    export function lifecycleList(map: Lifecycle.Map<any>) {
        return Object.entries(map).map(([label, status]) => Diagnostic(status, label));
    }

    export interface Elapsed {
        readonly startedAt: Timestamp;
        readonly time: Duration;
        toString(): string;
    }

    /**
     * Create a diagnostic that renders as elapsed time since creation.
     */
    export function elapsed(): Elapsed {
        return {
            startedAt: Time.nowUs,

            get time() {
                return Millis(Time.nowUs - this.startedAt);
            },

            toString() {
                return Duration.format(this.time);
            },
        };
    }

    /**
     * Upgrade a value to support specialized diagnostic rendering.
     */
    export function upgrade<T>(value: boolean | number | string | object, diagnostic: unknown): T {
        switch (typeof value) {
            case "boolean":
                value = new Boolean(value);
                break;

            case "number":
                value = new Number(value);
                break;

            case "string":
                value = new String(value);
                break;
        }

        if (typeof diagnostic === "function") {
            Object.defineProperty(value, Diagnostic.value, { get: diagnostic as () => unknown });
        } else {
            Object.defineProperty(value, Diagnostic.value, { value: diagnostic });
        }

        return value as T;
    }

    /**
     * Convert a number or bigint to a hex string which is prefixed by "0x" for logging purposes
     * @param value The number or bigint to convert
     * @param padding Optional padding width (pads with leading zeros). When padding is specified, the "0x" prefix is omitted for cleaner aligned output.
     */
    export function hex(value: number | bigint, padding?: number) {
        const hexString = value.toString(16);
        if (padding !== undefined) {
            return hexString.padStart(padding, "0");
        }
        return `0x${hexString}`;
    }

    /**
     * Convert a value to unstyled JSON.
     *
     * Specializes support for bigints and byte arrays.
     */
    export function json(data: any) {
        return JSON.stringify(data, (_, value) => {
            if (typeof value === "bigint") {
                return value.toString();
            }
            if (Bytes.isBytes(value)) {
                return Bytes.toHex(value);
            }
            if (value === undefined) {
                return "undefined";
            }
            return value;
        });
    }

    /**
     * Convert an object with keys to a flag list listing the truthy keys in a keylike/flag presentation.
     */
    export function asFlags(flags: Record<string, unknown>) {
        return Diagnostic.flag(Diagnostic.toFlagString(flags));
    }

    /**
     * Convert an object with keys to a space-separated list of truthy keys.
     */
    export function toFlagString(flags: Record<string, unknown>) {
        return Object.entries(flags)
            .filter(([, value]) => !!value)
            .map(([key]) => key)
            .join(" ");
    }

    /**
     * Extract message and stack diagnostic details.
     */
    export function messageAndStackFor(
        error: unknown,
        parentStack?: string[],
    ): { message: string; id?: string; path?: unknown; stack?: unknown[]; stackLines?: string[] } {
        let message: string | undefined;
        let rawStack: string | undefined;
        let id: string | undefined;
        let path: unknown | undefined;

        if (error !== undefined && error !== null) {
            if (typeof error === "string" || typeof error === "number") {
                return { message: `${error}` };
            }

            ({ message, stack: rawStack, id, path } = error as DiagnosticError);
            if (message === undefined) {
                message = error.toString();
            }

            if (typeof id !== "string") {
                id = undefined;
            }
        }

        if (message === undefined || message === null || message === "") {
            if (error !== undefined && error !== null) {
                message = error.constructor.name;
                if (!message || message === "Error") {
                    message = "(unknown error)";
                }
            } else {
                message = "(unknown error)";
            }
        }

        if (!rawStack) {
            return { message, id, path };
        }

        rawStack = rawStack.toString();

        // Strip extra node garbage off stack from node asserts
        rawStack = rawStack.replace(/^.*?\n\nError: /gs, "Error: ");

        // Strip off redundant error tag from v8
        if (rawStack.startsWith("Error: ")) {
            rawStack = rawStack.slice(7);
        }

        // Strip off redundant message from v8
        const pos = rawStack.indexOf(message);
        if (pos !== -1) {
            rawStack = rawStack.slice(pos + message.length).trim();
        }

        // Extract raw lines
        let stackLines = rawStack
            .split("\n")
            .map(line => line.trim())
            .filter(line => line !== "");

        // Node helpfully gives us this if there's no message.  It's not even the name of the error class, just "Error"
        if (stackLines[0] === "Error") {
            stackLines.shift();
        }

        // If there's a parent stack, identify the portion of the stack in common so we don't have to repeat it.  The stacks
        // may be truncated by the VM so this is not 100% guaranteed correct with recursive functions, but accidental
        // mismatches are unlikely
        let truncatedToParent = false;
        if (parentStack) {
            let truncateTo = 0;

            // For each line in the stack, find the line in the parent.  Skip the last two lines because truncating them
            // won't save space
            stackSearch: for (; truncateTo < stackLines.length - 1; truncateTo++) {
                let parentPos = parentStack.indexOf(stackLines[truncateTo]);
                if (parentPos === -1) {
                    continue;
                }

                // Found the line.  If all subsequent lines match then we truncate.  If either stack terminates before the
                // other, assume the stacks are truncated and consider a match
                parentPos++;
                for (
                    let pos = truncateTo + 1;
                    pos < stackLines.length && parentPos < parentStack.length;
                    pos++, parentPos++
                ) {
                    if (stackLines[pos] !== parentStack[parentPos]) {
                        continue stackSearch;
                    }
                }

                // Found a match.  Truncate but leave the top-most shared frame to make it clear where the commonality
                // with the parent starts
                stackLines = stackLines.slice(0, truncateTo + 1);
                truncatedToParent = true;
                break;
            }
        }

        // Spiff up stack lines a bit
        const stack = Array<unknown>();
        for (const line of stackLines) {
            const match1 = line.match(/^at\s+(?:(\S|\S.*\S)\s+\(([^)]+)\)|(<anonymous>))$/);
            if (match1) {
                const value = [Diagnostic.weak("at "), match1[1] ?? match1[3]];
                if (match1[2] !== undefined) {
                    value.push(Diagnostic.weak(" ("), Diagnostic.weak(match1[2]), Diagnostic.weak(")"));
                }
                stack.push(Diagnostic.squash(...value));
                continue;
            }

            const match2 = line.match(/^at\s+(\S.*)(:\d+:\d+)$/);
            if (match2) {
                stack.push(Diagnostic.squash(Diagnostic.weak("at "), match2[1], Diagnostic.weak(match2[2])));
                continue;
            }

            stack.push(line);
        }

        // Add truncation note
        if (truncatedToParent) {
            stack.push(Diagnostic.weak("(see parent frames)"));
        }

        return { message, id, path, stack, stackLines };
    }
}

function formatError(error: unknown, options: { messagePrefix?: string; parentStack?: string[] } = {}): unknown {
    const { messagePrefix, parentStack } = options;

    const messageAndStack = Diagnostic.messageAndStackFor(error, parentStack);
    let { stack, stackLines } = messageAndStack;

    let { message } = messageAndStack;

    const messageDiagnostic = Array<unknown>();
    if (messagePrefix) {
        messageDiagnostic.push(messagePrefix);
    }
    messageDiagnostic.push(Diagnostic.errorMessage(messageAndStack));

    message = Diagnostic.upgrade(message, messageDiagnostic);

    let cause, errors, secondary;
    if (typeof error === "object" && error !== null) {
        if ("error" in error && "suppressed" in error) {
            secondary = error.error;
            error = error.suppressed;
        }
        ({ cause, errors } = error as AggregateError);
    }

    // Report the error to context.  If return value is true, stack is already reported in this context so omit
    if (error && errorCollector?.(error)) {
        stack = stackLines = undefined;
    }

    if (stack === undefined && cause === undefined && errors === undefined) {
        return message;
    }

    const list: Array<unknown> = [message];
    if (stack === undefined) {
        // Ensure line break in case of no stack
        list.push(Diagnostic("list", []));
    } else {
        list.push(Diagnostic("list", stack));
    }

    // We render chained causes at the same level as the parent.  They are displayed atomically and there can be
    // only one so this is not ambiguous.  If we did not do this we would end up with a lot of indent levels
    for (; typeof cause === "object" && cause !== null; cause = (cause as Error).cause) {
        let formatted = formatError(cause, { messagePrefix: "Caused by:", parentStack: stackLines });
        if (Diagnostic.presentationOf(formatted) === "list") {
            formatted = (Diagnostic.valueOf(formatted) ?? formatted) as string | Diagnostic;
        }

        if (Array.isArray(formatted)) {
            list.push(...formatted);
        } else {
            list.push(formatted);
        }
    }

    // AggregateError support.  We render sub-errors as subordinate to the parent.  Otherwise the parent error would
    // be ambiguous.  This means they get an extra indent level but since they will not tend to be nested as deeply as
    // causes (I think) this is a decent tradeoff
    if (Array.isArray(errors)) {
        let cause = 0;
        list.push(
            Diagnostic.list(
                errors.map(e => formatError(e, { messagePrefix: `Cause #${cause++}:`, parentStack: stackLines })),
            ),
        );
    }

    // We also render secondary errors from suppressed errors as subordinate to the parent.
    if (secondary) {
        list.push(Diagnostic.list([formatError(secondary, { messagePrefix: "Secondary error during disposal:" })]));
    }

    return list;
}
