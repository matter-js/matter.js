/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError, InternalError } from "@matter/general";

/**
 * Whether an error raised while processing data a peer supplied is a defect of our own code.  A validator reports any
 * other error as a failure of the peer's data.
 */
export function isLocalDefect(error: unknown) {
    return error instanceof InternalError || error instanceof ImplementationError;
}
