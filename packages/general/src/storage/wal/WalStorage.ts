/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import type { Duration } from "#time/Duration.js";
import { Seconds } from "#time/TimeUnit.js";
import { Abort } from "#util/Abort.js";
import { Bytes } from "#util/Bytes.js";
import { BasicMultiplex } from "#util/Multiplex.js";
import type { Directory } from "../../fs/Directory.js";
import { Storage, StorageError } from "../Storage.js";
import type { SupportedStorageTypes } from "../StringifyTools.js";
import { WalCleaner } from "./WalCleaner.js";
import { type WalCommitId, encodeContextKey } from "./WalCommit.js";
import { WalReader } from "./WalReader.js";
import { WalSnapshot } from "./WalSnapshot.js";
import { WalTransaction, applyCommit } from "./WalTransaction.js";
import { WalWriter } from "./WalWriter.js";

const logger = Logger.get("WalStorage");

type StoreData = Record<string, Record<string, SupportedStorageTypes>>;

/**
 * Transactional storage backend using a write-ahead log (WAL).
 *
 * Data is loaded from the snapshot + WAL on first read and cached until a write invalidates the cache.  This keeps
 * memory free during steady-state operation when only writes occur.
 */
export class WalStorage extends Storage {
    readonly #storageDir: Directory;
    readonly #options: WalStorage.Options;
    #cache?: StoreData;
    #abort = new Abort();
    #workers = new BasicMultiplex();
    #initialized = false;
    #lastCommitId?: WalCommitId;
    #lastSnapshotCommitId?: WalCommitId;
    #writer?: WalWriter;
    #reader?: WalReader;
    #snapshot?: WalSnapshot;
    #cleaner?: WalCleaner;

    constructor(storageDir: Directory, options?: WalStorage.Options) {
        super();
        this.#storageDir = storageDir;
        this.#options = options ?? {};
    }

    get initialized() {
        return this.#initialized;
    }

    async initialize(): Promise<void> {
        if (this.#initialized) {
            throw new StorageError("WalStorage already initialized");
        }

        this.#abort = new Abort();
        this.#workers = new BasicMultiplex();
        this.#cache = undefined;
        this.#lastCommitId = undefined;
        this.#lastSnapshotCommitId = undefined;

        await this.#storageDir.mkdir();

        const walDir = this.#storageDir.directory("wal");
        await walDir.mkdir();

        this.#reader = new WalReader(walDir);
        this.#writer = new WalWriter(walDir, {
            maxSegmentSize: this.#options.maxSegmentSize,
            fsync: this.#options.fsync,
        });
        this.#snapshot = new WalSnapshot(this.#storageDir);
        this.#cleaner = new WalCleaner(walDir);

        // Start background workers
        const snapshotInterval = this.#options.snapshotInterval ?? Seconds(60);
        this.#workers.add(
            this.#runWorker("wal-snapshot", snapshotInterval, () => this.#runSnapshot()),
            "wal-snapshot",
        );

        const cleanInterval = this.#options.cleanInterval ?? Seconds(120);
        this.#workers.add(
            this.#runWorker("wal-clean", cleanInterval, () => this.#runClean()),
            "wal-clean",
        );

        this.#initialized = true;
    }

    async close(): Promise<void> {
        this.#abort();
        await this.#workers;

        // Final snapshot
        if (this.#lastCommitId) {
            await this.#runSnapshot();
            await this.#runClean();
        }

        await this.#writer?.close();
        this.#cache = undefined;
        this.#initialized = false;
    }

    // --- Read operations (loaded from cache) ---

    async get(contexts: string[], key: string): Promise<SupportedStorageTypes | undefined> {
        this.#assertInitialized();
        const store = await this.#loadCache();
        const contextKey = this.#contextKey(contexts);
        return store[contextKey]?.[key];
    }

    async keys(contexts: string[]): Promise<string[]> {
        this.#assertInitialized();
        const store = await this.#loadCache();
        const contextKey = this.#contextKey(contexts);
        return Object.keys(store[contextKey] ?? {});
    }

    async values(contexts: string[]): Promise<Record<string, SupportedStorageTypes>> {
        this.#assertInitialized();
        const store = await this.#loadCache();
        const contextKey = this.#contextKey(contexts);
        return { ...(store[contextKey] ?? {}) };
    }

    async contexts(contexts: string[]): Promise<string[]> {
        this.#assertInitialized();
        const store = await this.#loadCache();
        const contextKey = contexts.length ? contexts.join(".") : "";
        const prefix = contextKey.length ? `${contextKey}.` : "";
        const found = new Set<string>();
        for (const key of Object.keys(store)) {
            if (key.startsWith(prefix)) {
                const sub = key.substring(prefix.length).split(".");
                if (sub.length >= 1 && sub[0].length > 0) {
                    found.add(sub[0]);
                }
            }
        }
        return [...found];
    }

    // --- Write operations (delegate through transactions) ---

    async set(contexts: string[], values: Record<string, SupportedStorageTypes>): Promise<void>;
    async set(contexts: string[], key: string, value: SupportedStorageTypes): Promise<void>;
    async set(
        contexts: string[],
        keyOrValues: string | Record<string, SupportedStorageTypes>,
        value?: SupportedStorageTypes,
    ): Promise<void> {
        this.#assertInitialized();
        await using tx = await this.begin();
        if (typeof keyOrValues === "string") {
            await tx.set(contexts, keyOrValues, value!);
        } else {
            await tx.set(contexts, keyOrValues);
        }
        await tx.commit();
    }

    async delete(contexts: string[], key: string): Promise<void> {
        this.#assertInitialized();
        await using tx = await this.begin();
        await tx.delete(contexts, key);
        await tx.commit();
    }

    async clearAll(contexts: string[]): Promise<void> {
        this.#assertInitialized();
        await using tx = await this.begin();
        await tx.clearAll(contexts);
        await tx.commit();
    }

    async clear(): Promise<void> {
        this.#assertInitialized();
        await using tx = await this.begin();
        await tx.clear(true);
        await tx.commit();
    }

    // --- Transactions ---

    override async begin(): Promise<WalTransaction> {
        this.#assertInitialized();
        return new WalTransaction(this, this.#writer!, id => {
            this.#lastCommitId = id;
            this.#cache = undefined;
        });
    }

    // --- Blobs (not transactional, stored as separate files) ---

    async openBlob(contexts: string[], key: string): Promise<Blob> {
        this.#assertInitialized();
        const blobPath = this.#blobPath(contexts, key);
        const file = this.#storageDir.directory("blobs").file(blobPath);
        if (!(await file.exists())) {
            return new Blob([]);
        }
        const bytes = await file.readAllBytes();
        return new Blob([Bytes.exclusive(bytes)]);
    }

    async writeBlobFromStream(contexts: string[], key: string, stream: ReadableStream<Bytes>): Promise<void> {
        this.#assertInitialized();
        const blobPath = this.#blobPath(contexts, key);
        const blobsDir = this.#storageDir.directory("blobs");
        await blobsDir.mkdir();

        // Ensure parent directories exist
        const parts = blobPath.split("/");
        let dir = blobsDir;
        for (let i = 0; i < parts.length - 1; i++) {
            dir = dir.directory(parts[i]);
            await dir.mkdir();
        }

        const file = blobsDir.file(blobPath);
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        let length = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const data = Bytes.of(value);
            chunks.push(data);
            length += data.length;
        }
        const combined = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
            combined.set(chunk, offset);
            offset += chunk.length;
        }
        await file.write(combined);
    }

    // --- Internal ---

    async #loadCache(): Promise<StoreData> {
        if (this.#cache) {
            return this.#cache;
        }

        const store: StoreData = {};
        let afterCommitId: WalCommitId | undefined;

        // Load snapshot
        const snap = await this.#snapshot!.load();
        if (snap) {
            Object.assign(store, snap.data);
            afterCommitId = snap.commitId;
            this.#lastSnapshotCommitId = snap.commitId;
            logger.info("Loaded snapshot at commit", snap.commitId);
        }

        // Replay WAL from after the snapshot (or from the beginning)
        let replayCount = 0;
        for await (const { id, commit } of this.#reader!.read(afterCommitId)) {
            applyCommit(store, commit);
            this.#lastCommitId = id;
            replayCount++;
        }
        if (replayCount > 0) {
            logger.info(`Replayed ${replayCount} WAL commits`);
        } else if (afterCommitId) {
            this.#lastCommitId = afterCommitId;
        }

        this.#cache = store;
        return store;
    }

    async #runWorker(name: string, interval: Duration, task: () => Promise<void>): Promise<void> {
        while (!this.#abort.aborted) {
            await this.#abort.sleep(name, interval);
            if (this.#abort.aborted) return;

            try {
                await task();
            } catch (e) {
                logger.warn(`${name} worker error:`, e);
            }
        }
    }

    async #runSnapshot(): Promise<void> {
        if (!this.#lastCommitId) return;
        try {
            const store = await this.#loadCache();
            await this.#snapshot!.run(this.#lastCommitId, store);
            this.#lastSnapshotCommitId = this.#lastCommitId;
        } catch (e) {
            logger.warn("Snapshot failed:", e);
        }
    }

    async #runClean(): Promise<void> {
        if (!this.#lastSnapshotCommitId) return;
        try {
            await this.#cleaner!.run(this.#lastSnapshotCommitId);
        } catch (e) {
            logger.warn("WAL cleanup failed:", e);
        }
    }

    #contextKey(contexts: string[]): string {
        const key = contexts.join(".");
        if (!key.length || key.includes("..") || key.startsWith(".") || key.endsWith(".")) {
            throw new StorageError("Context must not be an empty string.");
        }
        return key;
    }

    #blobPath(contexts: string[], key: string): string {
        return encodeContextKey(contexts) + "/" + key;
    }

    #assertInitialized(): void {
        if (!this.#initialized) {
            throw new StorageError("WalStorage is not initialized");
        }
    }
}

export namespace WalStorage {
    export interface Options {
        /** Maximum WAL segment size in bytes. Default 16 MB. */
        maxSegmentSize?: number;
        /** Whether to fsync after each WAL write. Default true. */
        fsync?: boolean;
        /** Interval between periodic snapshots. Default 60s. */
        snapshotInterval?: Duration;
        /** Interval between periodic WAL cleanup. Default 120s. */
        cleanInterval?: Duration;
    }
}
