/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "#general";

export class CliError extends MatterError {
    // Error class won't be the same across vm contexts so make detection easier
    isCliError = true;
}

export class NotFoundError extends CliError {
    constructor(what: unknown) {
        super(`Not found: ${what}`);
    }
}

export class NotADirectoryError extends CliError {
    constructor(what: unknown) {
        super(`Not a directory: ${what}`);
    }
}

export class BadCommandError extends CliError {
    constructor(what: unknown) {
        super(`Bad command: ${what}`);
    }
}

export class NotACommandError extends CliError {
    constructor(what: unknown) {
        super(`Not a command: ${what}`);
    }
}

export class ArgumentError extends CliError {
    constructor(command: (...args: unknown[]) => unknown, message: string) {
        super(`${command.name}: ${message}`);
    }
}

/**
 * Thrown when statement appears incomplete and REPL should wait for more input.
 */
export class IncompleteError extends Error {
    constructor(cause: Error) {
        super(cause.message, { cause });
        this.cause = cause;
    }
}
