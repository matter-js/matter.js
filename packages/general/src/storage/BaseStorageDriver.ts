/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { MaybePromise } from "../util/Promises.js";

/**
 * Base class for all storage drivers. Defines the shared structural methods
 * for context-based key management. Extended by StorageDriver (KV) and
 * BlobStorageDriver (binary blobs).
 */
export type StorageType = "kv" | "blob";

export abstract class BaseStorageDriver {
    /**
     * Filenames that live in the storage root directory but are not data values.  Storage drivers that enumerate files
     * to discover keys must ignore these on read and reject them on write.
     */
    static readonly RESERVED_FILENAMES = new Set(["driver.json", "matter.lock", "matter.pid"]);

    abstract readonly type: StorageType;

    get id(): string {
        return (this.constructor as { id?: string }).id ?? this.constructor.name;
    }

    abstract readonly initialized: boolean;
    abstract initialize(): MaybePromise<void>;
    abstract close(): MaybePromise<void>;

    abstract delete(contexts: readonly string[], key: string): MaybePromise<void>;
    abstract has(contexts: readonly string[], key: string): MaybePromise<boolean>;
    abstract keys(contexts: readonly string[]): MaybePromise<string[]>;
    abstract contexts(contexts: readonly string[]): MaybePromise<string[]>;
    abstract clearAll(contexts: readonly string[]): MaybePromise<void>;
}
