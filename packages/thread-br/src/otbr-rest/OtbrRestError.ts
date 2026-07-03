/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "@matter/general";

export type OtbrRestErrorCode =
    "rest_unreachable" | "rest_protocol" | "rest_disabled" | "rest_unsupported" | "rest_conflict" | "rest_not_allowed";

export interface OtbrRestErrorOptions {
    cause?: Error;
    httpStatus?: number;
}

export class OtbrRestError extends MatterError {
    readonly code: OtbrRestErrorCode;
    override readonly cause?: Error;
    readonly httpStatus?: number;

    constructor(code: OtbrRestErrorCode, message: string, opts?: OtbrRestErrorOptions) {
        super(message);
        this.name = "OtbrRestError";
        this.code = code;
        this.cause = opts?.cause;
        this.httpStatus = opts?.httpStatus;
    }
}
