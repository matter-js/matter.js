/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Status } from "#globals/Status.js";
import { StatusResponseError } from "./StatusResponseError.js";

/**
 * Base class for validation errors and used when Data validation fails. Please check the provided data.
 * We encode this as StatusResponseError that returns a ConstrainError which is suitable for most
 * "invalid/out-of-bounds values" cases. If you can use any of the more detailed errors derived from this class please
 * do so!
 */
export class ValidationError extends StatusResponseError {
    public constructor(
        message: string,
        public fieldName?: string,
        errorCode = Status.ConstraintError,
    ) {
        super(message, errorCode);

        this.message = `(${this.constructor.name}/${this.code}) ${message}`;
    }
}

/** Validation error that is thrown when a value is out of bounds, but datatype and such is correct. */
export class ValidationOutOfBoundsError extends ValidationError {}

/**
 * Validation error that is thrown when a value is of the wrong datatype. This is a more specific version of the
 * ValidationError class and returns an InvalidAction error.
 */
export class ValidationDatatypeMismatchError extends ValidationError {
    public constructor(message: string, fieldName?: string) {
        super(message, fieldName, Status.InvalidAction);
    }
}

/**
 * Validation error that is thrown when a mandatory field is missing. This is a more specific version of the
 * ValidationError class and returns an InvalidAction error.
 */
export class ValidationMandatoryFieldMissingError extends ValidationError {
    public constructor(message: string, fieldName?: string) {
        super(message, fieldName, Status.InvalidAction);
    }
}

/**
 * Convert a function that may throw a ValidationError into a boolean predicate.
 */
export function validatorOf<A extends any[]>(test: (...a: A) => void) {
    return (...a: A) => {
        try {
            test(...a);
            return true;
        } catch (e) {
            ValidationError.accept(e);
            return false;
        }
    };
}
