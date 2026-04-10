/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ImplementationError } from "../MatterError.js";
import { MaybePromise } from "../util/Promises.js";
import { DatafileRoot } from "./DatafileRoot.js";
import type { DataNamespace } from "./DataNamespace.js";

/**
 * Base class for all storage drivers. Defines the shared structural methods
 * for context-based key management. Extended by StorageDriver (KV) and
 * BlobStorageDriver (binary blobs).
 */
export type StorageType = "kv" | "blob";

/** Constructor type constraint for the {@link FilesystemLocking} mixin. */
type BaseStorageDriverConstructor = abstract new (...args: any[]) => BaseStorageDriver;

/**
 * Mixin that adds filesystem-backed locking to any {@link BaseStorageDriver} subclass.
 *
 * Acquires a {@link DatafileRoot.Lock} during {@link initialize} and releases it during {@link close}.
 * Used by both KV and blob filesystem drivers to ensure exclusive access.
 *
 * @example
 * ```ts
 * class MyKvDriver extends FilesystemLocking(StorageDriver) { ... }
 * class MyBlobDriver extends FilesystemLocking(BlobStorageDriver) { ... }
 * ```
 */
export function FilesystemLocking<T extends BaseStorageDriverConstructor>(Base: T) {
    abstract class WithFilesystemLocking extends Base {
        /** @internal */ _fsRoot?: DatafileRoot;
        /** @internal */ _fsLock?: DatafileRoot.Lock;

        get root(): DatafileRoot | undefined {
            return this._fsRoot;
        }

        initFilesystem(namespace?: DataNamespace) {
            if (namespace !== undefined) {
                if (!(namespace instanceof DatafileRoot)) {
                    throw new ImplementationError("Filesystem storage driver requires a DatafileRoot namespace");
                }
                this._fsRoot = namespace;
            }
        }

        async acquireLock() {
            if (this._fsRoot) {
                this._fsLock = await this._fsRoot.lock();
            }
        }

        async releaseLock() {
            await this._fsLock?.close();
            this._fsLock = undefined;
        }
    }
    return WithFilesystemLocking;
}

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

    abstract get initialized(): boolean;
    abstract initialize(): MaybePromise<void>;
    abstract close(): MaybePromise<void>;

    abstract delete(contexts: readonly string[], key: string): MaybePromise<void>;
    abstract has(contexts: readonly string[], key: string): MaybePromise<boolean>;
    abstract keys(contexts: readonly string[]): MaybePromise<string[]>;
    abstract contexts(contexts: readonly string[]): MaybePromise<string[]>;
    abstract clearAll(contexts: readonly string[]): MaybePromise<void>;
}
