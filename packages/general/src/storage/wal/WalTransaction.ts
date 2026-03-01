/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Bytes } from "#util/Bytes.js";
import type { MaybePromise } from "#util/Promises.js";
import { StorageTransaction } from "../StorageTransaction.js";
import type { SupportedStorageTypes } from "../StringifyTools.js";
import type { WalCommit, WalCommitId, WalOp } from "./WalCommit.js";
import type { WalWriter } from "./WalWriter.js";

type StoreData = Record<string, Record<string, SupportedStorageTypes>>;

/**
 * Callback to notify the owning storage of a new commit ID.
 */
export type WalCommitNotify = (id: WalCommitId) => void;

/**
 * A transaction that buffers WAL operations and writes them atomically on commit.
 *
 * Owns the write path: serializes ops to the WAL writer and notifies the storage to invalidate its cache.
 */
export class WalTransaction extends StorageTransaction {
    readonly #ops: WalOp[] = [];
    readonly #writer: WalWriter;
    readonly #onCommit: WalCommitNotify;

    constructor(storage: import("./WalStorage.js").WalStorage, writer: WalWriter, onCommit: WalCommitNotify) {
        super(storage);
        this.#writer = writer;
        this.#onCommit = onCommit;
    }

    override get(contexts: string[], key: string): MaybePromise<SupportedStorageTypes | undefined> {
        // Check buffered ops (latest write wins)
        const contextKey = contexts.join(".");
        for (let i = this.#ops.length - 1; i >= 0; i--) {
            const op = this.#ops[i];
            if (op.key !== contextKey) continue;

            if (op.op === "upd") {
                if (key in op.values) {
                    return op.values[key];
                }
            } else if (op.op === "del") {
                if (!op.values || op.values.includes(key)) {
                    return undefined;
                }
            }
        }
        return this.storage.get(contexts, key);
    }

    override set(contexts: string[], values: Record<string, SupportedStorageTypes>): MaybePromise<void>;
    override set(contexts: string[], key: string, value: SupportedStorageTypes): MaybePromise<void>;
    override set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ): MaybePromise<void> {
        this.assertActive();
        const contextKey = contexts.join(".");
        const values = typeof keyOrValues === "string" ? { [keyOrValues]: value! } : keyOrValues;
        this.#ops.push({ op: "upd", key: contextKey, values });
    }

    override delete(contexts: string[], key: string): MaybePromise<void> {
        this.assertActive();
        const contextKey = contexts.join(".");
        this.#ops.push({ op: "del", key: contextKey, values: [key] });
    }

    override clearAll(contexts: string[]): MaybePromise<void> {
        this.assertActive();
        const contextKey = contexts.join(".");
        this.#ops.push({ op: "del", key: contextKey });
    }

    override keys(contexts: string[]): MaybePromise<string[]> {
        // Apply buffered ops on top of current state
        const contextKey = contexts.join(".");
        const result = new Set<string>();
        const baseKeys = this.storage.keys(contexts);

        const applyBuffered = (keys: string[]) => {
            for (const k of keys) {
                result.add(k);
            }
            for (const op of this.#ops) {
                if (op.key !== contextKey) continue;
                if (op.op === "upd") {
                    for (const k of Object.keys(op.values)) {
                        result.add(k);
                    }
                } else if (op.op === "del") {
                    if (op.values) {
                        for (const k of op.values) {
                            result.delete(k);
                        }
                    } else {
                        result.clear();
                    }
                }
            }
            return [...result];
        };

        if (baseKeys instanceof Promise) {
            return baseKeys.then(applyBuffered);
        }
        return applyBuffered(baseKeys as string[]);
    }

    override values(contexts: string[]): MaybePromise<Record<string, SupportedStorageTypes>> {
        const baseValues = this.storage.values(contexts);
        const contextKey = contexts.join(".");

        const applyBuffered = (vals: Record<string, SupportedStorageTypes>) => {
            const result = { ...vals };
            for (const op of this.#ops) {
                if (op.key !== contextKey) continue;
                if (op.op === "upd") {
                    Object.assign(result, op.values);
                } else if (op.op === "del") {
                    if (op.values) {
                        for (const k of op.values) {
                            delete result[k];
                        }
                    } else {
                        for (const k of Object.keys(result)) {
                            delete result[k];
                        }
                    }
                }
            }
            return result;
        };

        if (baseValues instanceof Promise) {
            return baseValues.then(applyBuffered);
        }
        return applyBuffered(baseValues as Record<string, SupportedStorageTypes>);
    }

    override contexts(contexts: string[]): MaybePromise<string[]> {
        const baseContexts = this.storage.contexts(contexts);
        const contextKey = contexts.length ? contexts.join(".") : "";
        const prefix = contextKey.length ? `${contextKey}.` : "";

        const applyBuffered = (ctxs: string[]) => {
            const result = new Set(ctxs);
            for (const op of this.#ops) {
                if (op.op === "upd") {
                    if (op.key.startsWith(prefix)) {
                        const sub = op.key.substring(prefix.length).split(".");
                        if (sub.length >= 1 && sub[0].length > 0) {
                            result.add(sub[0]);
                        }
                    }
                } else if (op.op === "del" && !op.values) {
                    if (op.key === contextKey) {
                        result.clear();
                    } else if (op.key.startsWith(prefix)) {
                        const sub = op.key.substring(prefix.length).split(".");
                        if (sub.length >= 1 && sub[0].length > 0) {
                            result.delete(sub[0]);
                        }
                    }
                }
            }
            return [...result];
        };

        if (baseContexts instanceof Promise) {
            return baseContexts.then(applyBuffered);
        }
        return applyBuffered(baseContexts as string[]);
    }

    override openBlob(contexts: string[], key: string): MaybePromise<Blob> {
        return this.storage.openBlob(contexts, key);
    }

    override writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): MaybePromise<void> {
        return this.storage.writeBlobFromStream(contexts, key, stream);
    }

    override async commit(): Promise<void> {
        this.assertActive();
        if (this.#ops.length > 0) {
            const id = await this.#writer.write(this.#ops);
            this.#onCommit(id);
        }
        super.commit();
    }

    protected override rollback(): void {
        this.#ops.length = 0;
    }
}

/**
 * Apply a WAL commit to an in-memory store.  Used by WalStorage when loading the cache from snapshot + WAL replay.
 */
export function applyCommit(store: StoreData, commit: WalCommit): void {
    for (const op of commit.ops) {
        if (op.op === "upd") {
            if (!store[op.key]) {
                store[op.key] = {};
            }
            Object.assign(store[op.key], op.values);
        } else if (op.op === "del") {
            if (op.key === "") {
                for (const k of Object.keys(store)) {
                    delete store[k];
                }
            } else if (op.values) {
                if (store[op.key]) {
                    for (const k of op.values) {
                        delete store[op.key][k];
                    }
                }
            } else {
                delete store[op.key];
                const prefix = `${op.key}.`;
                for (const k of Object.keys(store)) {
                    if (k.startsWith(prefix)) {
                        delete store[k];
                    }
                }
            }
        }
    }
}
