/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "#util/Bytes.js";
import { BlobStorageDriver } from "./BlobStorageDriver.js";
import { StorageError } from "./StorageDriver.js";

/**
 * In-memory blob storage driver for tests and non-filesystem environments.
 */
export class MemoryBlobStorageDriver extends BlobStorageDriver {
    static readonly id: string = "memory-blob";

    readonly #store = new Map<string, Map<string, Uint8Array>>();

    get initialized() {
        return true;
    }

    initialize() {
        // No-op
    }

    close() {
        this.#store.clear();
    }

    #createContextKey(contexts: readonly string[]) {
        for (const ctx of contexts) {
            if (!ctx.length || ctx.includes(".")) {
                throw new StorageError("Context must not contain empty segments or leading or trailing dots.");
            }
        }
        return contexts.join(".");
    }

    #contextMap(contexts: readonly string[]): Map<string, Uint8Array> | undefined {
        return this.#store.get(this.#createContextKey(contexts));
    }

    #ensureContextMap(contexts: readonly string[]): Map<string, Uint8Array> {
        const key = this.#createContextKey(contexts);
        let map = this.#store.get(key);
        if (map === undefined) {
            map = new Map();
            this.#store.set(key, map);
        }
        return map;
    }

    openBlob(contexts: string[], key: string): Blob {
        const map = this.#contextMap(contexts);
        if (map === undefined) {
            return new Blob([]);
        }
        const value = map.get(key);
        if (value === undefined) {
            return new Blob([]);
        }
        if (!Bytes.isBytes(value)) {
            throw new StorageError("Value must be Bytes to read as blob.");
        }
        return new Blob([Bytes.exclusive(value)]);
    }

    async writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): Promise<void> {
        const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
        this.#ensureContextMap(contexts).set(key, bytes);
    }

    /**
     * Synchronously set bytes for a key, bypassing stream-based write.
     * Useful in tests where async stream operations may not work with MockTime.
     */
    setBytes(contexts: readonly string[], key: string, data: Uint8Array) {
        this.#ensureContextMap(contexts).set(key, Bytes.of(data));
    }

    /**
     * Synchronously get bytes for a key.
     * Useful in tests where async blob reading may not work with MockTime.
     */
    getBytes(contexts: readonly string[], key: string): Uint8Array | undefined {
        return this.#contextMap(contexts)?.get(key);
    }

    delete(contexts: string[], key: string) {
        this.#contextMap(contexts)?.delete(key);
    }

    has(contexts: string[], key: string) {
        return this.#contextMap(contexts)?.has(key) ?? false;
    }

    keys(contexts: string[]) {
        const map = this.#contextMap(contexts);
        return map ? [...map.keys()] : [];
    }

    contexts(contexts: string[]) {
        const contextKey = contexts.length ? this.#createContextKey(contexts) : "";
        const startContextKey = contextKey.length ? `${contextKey}.` : "";
        const foundContexts = new Array<string>();
        for (const key of this.#store.keys()) {
            if (key.startsWith(startContextKey)) {
                const subKeys = key.substring(startContextKey.length).split(".");
                if (subKeys.length < 1) continue;
                const context = subKeys[0];
                if (context.length && !foundContexts.includes(context)) {
                    foundContexts.push(context);
                }
            }
        }
        return foundContexts;
    }

    clearAll(contexts: string[]) {
        const contextKey = this.#createContextKey(contexts);
        this.#store.delete(contextKey);
        const startContextKey = contextKey.length ? `${contextKey}.` : "";
        for (const key of [...this.#store.keys()]) {
            if (key.startsWith(startContextKey)) {
                this.#store.delete(key);
            }
        }
    }
}
