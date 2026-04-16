/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BlobStorageDriver } from "@matter/general";

/**
 * Storage Scopes allow flagging a context for a specific usage.
 * This is mainly used for BDX transfers currently to allow separating OTA related storage from log related storage
 * and to automatically choose the right one based on the incoming file designator.
 */
export type StorageScope = "ota" | "log";

export class ScopedStorage {
    readonly scope: StorageScope;
    readonly #blobDriver: BlobStorageDriver;
    readonly #baseContexts: string[];

    constructor(blobDriver: BlobStorageDriver, baseContexts: string[], scope: StorageScope) {
        this.#blobDriver = blobDriver;
        this.#baseContexts = baseContexts;
        this.scope = scope;
    }

    get blobDriver(): BlobStorageDriver {
        return this.#blobDriver;
    }

    get baseContexts(): readonly string[] {
        return this.#baseContexts;
    }
}
