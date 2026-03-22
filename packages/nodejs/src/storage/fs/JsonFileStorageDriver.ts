/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    type Bytes,
    type DataNamespace,
    FilesystemStorageDriver,
    fromJson,
    MemoryStorageDriver,
    Seconds,
    type StorageDriver,
    StorageError,
    type SupportedStorageTypes,
    Time,
    toJson,
} from "@matter/general";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

export class JsonFileStorageDriver extends FilesystemStorageDriver {
    static readonly id = "json";

    /** We store changes after a value was set to the storage, but not more often than this setting (in ms). */
    static commitDelay = Seconds.one;
    committed = Promise.resolve();

    #commitTimer = Time.getTimer("Storage commit", JsonFileStorageDriver.commitDelay, () => this.#commit());
    #closed = false;
    #resolveCommitted?: () => void;
    readonly #path: string;
    #store: MemoryStorageDriver;

    constructor(namespaceOrPath?: DataNamespace | string) {
        super(typeof namespaceOrPath === "string" || namespaceOrPath === undefined ? undefined : namespaceOrPath);
        this.#path =
            typeof namespaceOrPath === "string"
                ? namespaceOrPath
                : namespaceOrPath !== undefined
                  ? join(this.root!.directory.path, "storage.json")
                  : "";
        this.#store = new MemoryStorageDriver();
    }

    static async create(namespace: DataNamespace, _descriptor?: StorageDriver.Descriptor) {
        const storage = new JsonFileStorageDriver(namespace);
        await storage.initialize();
        return storage;
    }

    override get initialized() {
        return this.#store.initialized;
    }

    override async initialize() {
        if (this.initialized) throw new StorageError("Storage already initialized!");
        await super.initialize();
        let data: any = {};
        try {
            data = fromJson(readFileSync(this.#path, "utf-8"));
        } catch (error: any) {
            // We accept that the file does not exist yet to initialize with an empty store.
            if (error.code !== "ENOENT") {
                throw error;
            }
        }
        this.#store = new MemoryStorageDriver(data);
        this.#store.initialize();
    }

    #triggerCommit() {
        if (!this.#commitTimer.isRunning) {
            this.committed = new Promise(resolve => {
                this.#resolveCommitted = resolve;
            });
            this.#commitTimer.start();
        }
    }

    override get(contexts: string[], key: string): SupportedStorageTypes | undefined {
        return this.#store.get(contexts, key);
    }

    override set(contexts: string[], values: Record<string, SupportedStorageTypes>): void;
    override set(contexts: string[], key: string, value: SupportedStorageTypes): void;
    override set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ): void {
        this.#store.set(contexts, keyOrValues, value);
        this.#triggerCommit();
    }

    override delete(contexts: string[], key: string): void {
        this.#store.delete(contexts, key);
        this.#triggerCommit();
    }

    override keys(contexts: string[]): string[] {
        return this.#store.keys(contexts);
    }

    override values(contexts: string[]): Record<string, SupportedStorageTypes> {
        return this.#store.values(contexts);
    }

    override contexts(contexts: string[]): string[] {
        return this.#store.contexts(contexts);
    }

    override clearAll(contexts: string[]): void {
        this.#store.clearAll(contexts);
    }

    override openBlob(contexts: string[], key: string): Blob {
        return this.#store.openBlob(contexts, key);
    }

    override writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): Promise<void> {
        return this.#store.writeBlobFromStream(contexts, key, stream);
    }

    async #commit() {
        if (!this.initialized || this.#closed) return;
        if (this.#commitTimer.isRunning) {
            this.#commitTimer.stop();
        }
        try {
            await writeFile(this.#path, toJson(this.#store.data, 1), "utf-8");
        } finally {
            if (this.#resolveCommitted !== undefined) {
                this.#resolveCommitted();
            }
        }
    }

    override async close() {
        this.#commitTimer.stop();
        await this.#commit();
        await this.#store.close();
        this.#closed = true;
        await super.close();
    }
}
