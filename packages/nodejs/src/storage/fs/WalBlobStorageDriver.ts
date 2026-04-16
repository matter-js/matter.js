/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { type DataNamespace, DatafileRoot, ImplementationError } from "@matter/general";
import { DirectoryBlobStorageDriver } from "./DirectoryBlobStorageDriver.js";

/**
 * Blob driver for the legacy WAL blob layout where blobs lived in a `blobs/` subdirectory.
 * @deprecated Migrate to "dir" blob driver.
 */
export class WalBlobStorageDriver extends DirectoryBlobStorageDriver {
    static override readonly id = "wal";

    static override create(namespace: DataNamespace, _descriptor: { kind: string }): WalBlobStorageDriver {
        if (!(namespace instanceof DatafileRoot)) {
            throw new ImplementationError("WalBlobStorageDriver requires a DatafileRoot namespace");
        }
        // Shift root into the blobs/ subdirectory
        const blobsRoot = new DatafileRoot(namespace.directory.directory("blobs"));
        return new WalBlobStorageDriver(blobsRoot);
    }

    private constructor(namespace: DataNamespace) {
        super(namespace);
    }
}
