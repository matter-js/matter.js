/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScopedStorage } from "#bdx/ScopedStorage.js";
import { Bytes, ImplementationError, Logger, StorageContext } from "#general";
import { FileDesignator } from "./FileDesignator.js";

const logger = Logger.get("PersistedFileDesignator");

/**
 * A FileDesignator that points to a persisted file in a given StorageContext.
 * If the file is supposed to be used for Bdx transfers where it could be requested ba a client and is not actively
 * sent or the location to store a received file, you need to pass a ScopedStorage to allow automatic target detection
 * for BDX.
 */
export class PersistedFileDesignator extends FileDesignator {
    #storage: StorageContext;
    #blob?: Blob;
    #blobName: string;

    constructor(fd: string | Bytes | FileDesignator, storage: StorageContext | ScopedStorage) {
        if (fd instanceof FileDesignator) {
            fd = fd.bytes;
        }
        const blobName = Bytes.isBytes(fd) ? Bytes.toString(fd) : fd;
        if (storage instanceof ScopedStorage) {
            fd = Bytes.fromString(`${storage.scope}/${blobName}`);
            storage = storage.context;
        }
        super(fd);
        this.#storage = storage;
        this.#blobName = blobName;
    }

    exists() {
        return this.#storage.has(this.#blobName);
    }

    get blobName() {
        return this.#blobName;
    }

    async openBlob() {
        if (this.#blob === undefined) {
            const blobName = this.#blobName;
            if (!this.#storage.has(blobName)) {
                throw new ImplementationError(
                    `File designator must point to an existing blob "${blobName}" in the storage to send data`,
                );
            }
            this.#blob = await this.#storage.openBlob(blobName);
        }
        return this.#blob;
    }

    writeFromStream(stream: ReadableStream<Bytes>) {
        logger.debug(`Writing blob "${this.#blobName}" to storage`);
        return this.#storage.writeBlobFromStream(this.#blobName, stream);
    }

    delete() {
        logger.debug(`Deleting blob "${this.#blobName}" from storage`);
        return this.#storage.delete(this.#blobName);
    }
}
