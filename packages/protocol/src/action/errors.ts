/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Schema, SchemaErrorPath, ValueModel } from "#model";
import { Status, StatusResponseError } from "#types";

export { SchemaImplementationError } from "#model";

/**
 * Thrown due operational schema violation.
 */
export class SchemaViolationError extends StatusResponseError {
    constructor(prefix: string, path: SchemaErrorPath, message: string, code: Status) {
        const text = `${prefix} ${path.path ?? path}: ${message} (${code})`;
        super(text, code);

        // Remove default status code injection
        this.message = text;
    }
}

/**
 * Thrown for invalid reads.
 */
export class ReadError extends SchemaViolationError {
    constructor(path: SchemaErrorPath, message: string, code?: Status) {
        super("Reading", path, message, code ?? Status.UnsupportedRead);
    }
}

/**
 * Thrown for invalid writes.
 */
export class WriteError extends SchemaViolationError {
    constructor(path: SchemaErrorPath, message: string, code?: Status) {
        super("Writing", path, message, code ?? Status.UnsupportedWrite);
    }
}

/**
 * Thrown for invalid invokes.
 */
export class InvokeError extends SchemaViolationError {
    constructor(path: SchemaErrorPath, message: string, code?: Status) {
        super("Invoking", path, message, code ?? Status.UnsupportedAccess);
    }
}

/**
 * Thrown when validation fails.
 */
export class ValidateError extends SchemaViolationError {
    constructor(path: SchemaErrorPath, message: string, code?: Status) {
        super("Validating", path, message, code ?? Status.InvalidDataType);
    }
}

/**
 * Thrown when a value is of the wrong datatype.
 */
export class DatatypeError extends ValidateError {
    constructor(path: SchemaErrorPath, type: string, value: unknown, code?: Status) {
        let str = `${value}`;
        if (str.length > 60) {
            str = `${str.substring(60)}…`;
        }
        super(path, `Value "${str}" is not ${type}`, code);
    }
}

/**
 * Thrown when constraint is violated.
 */
export class ConstraintError extends ValidateError {
    constructor(schema: Schema, path: SchemaErrorPath, message: string) {
        super(path, `Constraint "${(schema as ValueModel).constraint}": ${message}`, Status.ConstraintError);
    }
}

/**
 * Thrown when a numeric value can't fit in an integer type.
 */
export class IntegerRangeError extends ValidateError {
    constructor(path: SchemaErrorPath, message: string) {
        super(path, message, Status.ConstraintError);
    }
}

/**
 * Thrown when an enum value is not known based on Matter specification
 */
export class UnknownEnumValueError extends ValidateError {
    constructor(path: SchemaErrorPath, message: string) {
        super(path, message, Status.ConstraintError);
    }
}

/**
 * Thrown when conformance is violated.
 */
export class ConformanceError extends ValidateError {
    constructor(schema: Schema, path: SchemaErrorPath, message: string, choice?: string) {
        let prefix;
        if (choice) {
            prefix = `Conformance choice "${choice}"`;
        } else {
            prefix = `Conformance "${(schema as ValueModel).conformance}"`;
        }
        super(path, `${prefix}: ${message}`, Status.ConstraintError);
    }
}

/**
 * Thrown when an enum value is not valid based on conformance definitions
 */
export class EnumValueConformanceError extends ConformanceError {}

/**
 * Thrown for access attempts against a managed value that is no longer valid.
 */
export class ExpiredReferenceError extends SchemaViolationError {
    constructor(path: SchemaErrorPath) {
        super("Referencing", path, "This value is no longer available because its context has exited", Status.Failure);
    }
}

/**
 * Thrown for access attempts against a managed value referencing a container that was removed.
 */
export class PhantomReferenceError extends SchemaViolationError {
    constructor(path: SchemaErrorPath) {
        super("Referencing", path, "Container was removed", Status.Failure);
    }
}
