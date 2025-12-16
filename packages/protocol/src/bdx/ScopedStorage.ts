/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StorageContext } from "#general";

/**
 * Storage Scopes allows flagging a context for a specific usage to.
 * This is mainly used for BDX transfers currently to allow separating OTA related storage from log related storage
 * and to automatically choose the right on based on the incoming file designator.
 */
export type StorageScope = "ota" | "log";

export class ScopedStorage {
    readonly scope: StorageScope;

    constructor(
        public readonly context: StorageContext,
        scope: StorageScope,
    ) {
        this.scope = scope;
    }
}
