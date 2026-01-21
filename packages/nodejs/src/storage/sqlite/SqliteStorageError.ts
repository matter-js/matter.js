/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StorageError } from "@matter/general";

/**
 * StorageError with
 *
 * `methodType`: Method type of Storage
 * `contextKey`: Context$Key
 */
export class SqliteStorageError extends StorageError {
    constructor(
        public readonly methodType: string,
        public readonly contextKey: string,
        public readonly mainReason: string,
    ) {
        super(`[${methodType.toUpperCase()}] ${contextKey}: ${mainReason}`);
    }
}
