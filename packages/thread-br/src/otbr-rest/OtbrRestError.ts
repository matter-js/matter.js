/**
 * @license
 * Copyright 2025-2026 Open Home Foundation
 * SPDX-License-Identifier: Apache-2.0
 */

export type OtbrRestErrorCode = "rest_unreachable" | "rest_protocol" | "rest_disabled";

export interface OtbrRestErrorOptions {
    cause?: Error;
    httpStatus?: number;
}

export class OtbrRestError extends Error {
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
