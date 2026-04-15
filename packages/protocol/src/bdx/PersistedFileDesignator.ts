/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ScopedStorage } from "#bdx/ScopedStorage.js";
import { BlobStorageDriver, Bytes, ImplementationError, Logger } from "@matter/general";
import { FileDesignator } from "./FileDesignator.js";

const logger = Logger.get("PersistedFileDesignator");

/**
 * A FileDesignator that points to a persisted blob in a BlobStorageDriver.
 * If the file is supposed to be used for Bdx transfers where it could be requested by a client and is not actively
 * sent or the location to store a received file, you need to pass a ScopedStorage to allow automatic target detection
 * for BDX.
 * The logic supports providing names separated by "." to automatically create sub contexts.
 */
export class PersistedFileDesignator extends FileDesignator {
    #blobDriver: BlobStorageDriver;
    #contexts: string[];
    #blob?: Blob;
    #blobName: string;

    constructor(fd: string | Bytes | FileDesignator, storage: BlobStorageDriver | ScopedStorage, contexts?: string[]) {
        if (fd instanceof FileDesignator) {
            fd = fd.bytes;
        }
        const blobName = Bytes.isBytes(fd) ? Bytes.toString(fd) : fd;

        let blobDriver: BlobStorageDriver;
        let baseContexts: readonly string[];

        if (storage instanceof ScopedStorage) {
            fd = Bytes.fromString(`${storage.scope}/${blobName}`);
            blobDriver = storage.blobDriver;
            baseContexts = storage.baseContexts;
        } else {
            blobDriver = storage;
            baseContexts = contexts ?? [];
        }

        super(fd);

        const subContext = blobName.split(".");
        this.#blobName = subContext.pop()!;
        this.#contexts = [...baseContexts, ...subContext];
        this.#blobDriver = blobDriver;
    }

    exists() {
        return this.#blobDriver.has(this.#contexts, this.#blobName);
    }

    get blobName() {
        return this.#blobName;
    }

    async openBlob() {
        if (this.#blob === undefined) {
            if (!(await this.#blobDriver.has(this.#contexts, this.#blobName))) {
                throw new ImplementationError(
                    `File designator must point to an existing blob "${this.#blobName}" in the storage to send data`,
                );
            }
            this.#blob = await this.#blobDriver.openBlob(this.#contexts, this.#blobName);
        }
        return this.#blob;
    }

    writeFromStream(stream: ReadableStream<Bytes>) {
        logger.debug(`Writing blob "${this.text}" (${this.#blobName}) to storage`);
        return this.#blobDriver.writeBlobFromStream(this.#contexts, this.#blobName, stream);
    }

    delete() {
        logger.debug(`Deleting blob "${this.text}" (${this.#blobName}) from storage`);
        return this.#blobDriver.delete(this.#contexts, this.#blobName);
    }
}
