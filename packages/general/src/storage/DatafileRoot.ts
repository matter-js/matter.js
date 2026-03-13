/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Directory } from "../fs/Directory.js";
import type { MaybePromise } from "../util/Promises.js";
import { DataNamespace } from "./DataNamespace.js";

/**
 * Consolidates all per-node filesystem concerns.
 *
 * Holds a {@link Directory} (the node's data directory, e.g. `~/.matter/<nodeId>/`), manages locking, and provides the
 * base path for sockets, logs, ready files, etc.
 *
 * Locking is reference-counted: the physical lock is acquired when the first {@link DatafileRoot.Lock} is created and
 * released when the last one closes.
 */
export class DatafileRoot extends DataNamespace {
    #directory: Directory;
    #release?: () => MaybePromise<void>;
    #refCount = 0;
    #lockPromise?: Promise<DatafileRoot.Lock>;

    constructor(directory: Directory) {
        super(directory.name);
        this.#directory = directory;
    }

    get directory(): Directory {
        return this.#directory;
    }

    get path(): string {
        return this.#directory.path;
    }

    get isLocked(): boolean {
        return this.#refCount > 0;
    }

    /**
     * Acquire a reference-counted lock.  The physical directory lock is acquired on the first call and released when
     * the last {@link DatafileRoot.Lock} closes.
     */
    async lock(): Promise<DatafileRoot.Lock> {
        // Serialize concurrent lock() calls to avoid double-acquiring the physical lock
        if (this.#lockPromise) {
            await this.#lockPromise;
        }

        const promise = this.#acquireRef();
        this.#lockPromise = promise;
        try {
            return await promise;
        } finally {
            if (this.#lockPromise === promise) {
                this.#lockPromise = undefined;
            }
        }
    }

    async #acquireRef(): Promise<DatafileRoot.Lock> {
        if (this.#refCount === 0) {
            this.#release = await this.#directory.lock();
        }
        this.#refCount++;

        return new DatafileRoot.Lock(this.#directory, () => this.#releaseRef());
    }

    async #releaseRef(): Promise<void> {
        this.#refCount--;
        if (this.#refCount === 0) {
            const release = this.#release;
            this.#release = undefined;
            await release?.();
        }
    }
}

export namespace DatafileRoot {
    /**
     * A reference-counted handle to the directory lock.  Closing the lock decrements the reference count; the physical
     * lock is released when the last Lock closes.
     */
    export class Lock implements AsyncDisposable {
        #directory: Directory;
        #release?: () => Promise<void>;

        constructor(directory: Directory, release: () => Promise<void>) {
            this.#directory = directory;
            this.#release = release;
        }

        get directory(): Directory {
            return this.#directory;
        }

        get path(): string {
            return this.#directory.path;
        }

        async close(): Promise<void> {
            const release = this.#release;
            if (release) {
                this.#release = undefined;
                await release();
            }
        }

        async [Symbol.asyncDispose](): Promise<void> {
            await this.close();
        }
    }
}
