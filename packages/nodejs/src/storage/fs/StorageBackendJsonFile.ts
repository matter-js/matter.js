/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { fromJson, Seconds, StorageBackendMemory, StorageError, SupportedStorageTypes, Time, toJson } from "#general";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";

export class StorageBackendJsonFile extends StorageBackendMemory {
    /** We store changes after a value was set to the storage, but not more often than this setting (in ms). */
    static commitDelay = Seconds.one;
    committed = Promise.resolve();

    private readonly commitTimer = Time.getTimer("Storage commit", StorageBackendJsonFile.commitDelay, () =>
        this.commit(),
    );
    private closed = false;
    private resolveCommitted?: () => void;

    constructor(private readonly path: string) {
        super();
    }

    static override async create(path: string) {
        const storage = new this(path);
        storage.initialize();
        return storage;
    }

    override initialize() {
        if (this.initialized) throw new StorageError("Storage already initialized!");
        super.initialize();
        try {
            this.store = this.fromJson(readFileSync(this.path, "utf-8"));
        } catch (error: any) {
            // We accept that the file does not exist yet to initialize with an empty store.
            if (error.code !== "ENOENT") {
                throw error;
            }
        }
        this.isInitialized = true;
    }

    private triggerCommit() {
        if (!this.commitTimer.isRunning) {
            this.committed = new Promise(resolve => {
                this.resolveCommitted = resolve;
            });
            this.commitTimer.start();
        }
    }

    override set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ): void {
        super.set(contexts, keyOrValues, value);
        this.triggerCommit();
    }

    override delete(contexts: string[], key: string): void {
        super.delete(contexts, key);
        this.triggerCommit();
    }

    private async commit() {
        if (!this.initialized || this.closed) return;
        if (this.commitTimer.isRunning) {
            this.commitTimer.stop();
        }
        try {
            await writeFile(this.path, this.toJson(this.store), "utf-8");
        } finally {
            if (this.resolveCommitted !== undefined) {
                this.resolveCommitted?.();
            }
        }
    }

    override async close() {
        this.commitTimer.stop();
        await this.commit();
        await super.close();
        this.closed = true;
        this.isInitialized = false;
    }

    private toJson(object: any): string {
        return toJson(object, 1);
    }

    private fromJson(json: string): any {
        return fromJson(json);
    }
}
