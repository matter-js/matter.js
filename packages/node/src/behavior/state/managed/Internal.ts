/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Val } from "#protocol";

/**
 * API for bypassing managed collections and accessing the internal object containing raw data.
 */
export namespace Internal {
    export const reference = Symbol("reference");
    export const session = Symbol("session");

    export interface Collection {
        [reference]: Val.Reference<Val.Collection>;
    }
}
