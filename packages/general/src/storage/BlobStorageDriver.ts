/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";
import type { Directory } from "../fs/Directory.js";
import { ImplementationError } from "../MatterError.js";
import { MaybePromise } from "../util/Promises.js";
import { BaseStorageDriver, type StorageType } from "./BaseStorageDriver.js";
import { DatafileRoot } from "./DatafileRoot.js";
import type { DataNamespace } from "./DataNamespace.js";

/**
 * Storage driver for binary blob data, separate from key-value storage.
 * Contexts map to directories; keys map to individual blobs.
 */
export abstract class BlobStorageDriver extends BaseStorageDriver {
    override readonly type = "blob" as const;

    abstract openBlob(contexts: string[], key: string): MaybePromise<Blob>;
    abstract writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): MaybePromise<void>;
}

/**
 * {@link BlobStorageDriver} subclass for drivers backed by the filesystem.
 *
 * Manages a {@link DatafileRoot.Lock} that is acquired during {@link initialize} and released during {@link close}.
 * Filesystem-specific blob drivers should extend this instead of {@link BlobStorageDriver} directly.
 */
export abstract class FilesystemBlobStorageDriver extends BlobStorageDriver {
    readonly #root?: DatafileRoot;
    #lock?: DatafileRoot.Lock;

    constructor(namespace?: DataNamespace) {
        super();
        if (namespace !== undefined) {
            if (!(namespace instanceof DatafileRoot)) {
                throw new ImplementationError("Filesystem blob storage driver requires a DatafileRoot namespace");
            }
            this.#root = namespace;
        }
    }

    get root(): DatafileRoot | undefined {
        return this.#root;
    }

    async initialize() {
        if (this.#lock) {
            throw new ImplementationError("Filesystem blob storage driver is already initialized");
        }
        if (this.#root) {
            this.#lock = await this.#root.lock();
        }
    }

    async close() {
        await this.#lock?.close();
        this.#lock = undefined;
    }
}

export namespace BlobStorageDriver {
    export interface Descriptor {
        kind: string;
        type?: StorageType;
    }

    export interface Implementation<D extends Descriptor = Descriptor> {
        id: string;
        create(namespace: DataNamespace, descriptor: D): MaybePromise<BlobStorageDriver>;
        preinitialize?(parentDir: Directory, descriptor: D): MaybePromise<void>;
    }
}
