/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";
import type { Directory } from "../fs/Directory.js";
import { MaybePromise } from "../util/Promises.js";
import { BaseStorageDriver, type StorageType } from "./BaseStorageDriver.js";
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
