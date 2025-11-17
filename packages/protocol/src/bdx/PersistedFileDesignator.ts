/**
 * @license
 * Copyright 2022-2025 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes, ImplementationError, StorageContext } from "#general";
import { FileDesignator } from "./FileDesignator.js";

/** A FileDesignator that points to a persisted file in a given StorageContext. */
export class PersistedFileDesignator extends FileDesignator {
    #storage: StorageContext;
    #blob?: Blob;

    constructor(fd: string | Bytes | FileDesignator, storage: StorageContext) {
        if (fd instanceof FileDesignator) {
            fd = fd.bytes;
        }
        super(fd);
        this.#storage = storage;
    }

    exists() {
        return this.#storage.has(this.text);
    }

    async openBlob() {
        if (this.#blob === undefined) {
            const blobName = this.text;
            if (!this.#storage.has(blobName)) {
                throw new ImplementationError(
                    "File designator must point to an existing file in the storage to send data",
                );
            }
            this.#blob = await this.#storage.openBlob(blobName);
        }
        return this.#blob;
    }

    writeFromStream(stream: ReadableStream<Bytes>) {
        return this.#storage.writeBlobFromStream(this.text, stream);
    }

    delete() {
        return this.#storage.delete(this.text);
    }
}
