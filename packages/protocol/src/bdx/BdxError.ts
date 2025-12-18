/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MatterError } from "#general";
import { BdxStatusCode, GeneralStatusCode } from "#types";

/** Error class used by the BDX protocol. */
export class BdxError extends MatterError {
    #code: BdxStatusCode;
    bytesTransferred = 0;
    totalBytesLength?: number;

    constructor(message: string, code: BdxStatusCode = BdxStatusCode.Unknown) {
        super(`BDX error ${BdxStatusCode[code]}(${code}): ${message}`);
        this.#code = code;
    }

    get code(): BdxStatusCode {
        return this.#code;
    }

    static is(error: unknown) {
        return error instanceof BdxError;
    }
}

/** Error base Class for all errors related to the BDX status response messages. */
export class BdxStatusResponseError extends MatterError {
    public constructor(
        message: string,
        public readonly generalStatusCode: GeneralStatusCode,
        public readonly protocolStatusCode: BdxStatusCode,
    ) {
        super(
            `(${GeneralStatusCode[generalStatusCode]} (${generalStatusCode}) / ${BdxStatusCode[protocolStatusCode]} (${protocolStatusCode})) ${message}`,
        );
    }
}
