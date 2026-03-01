/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import type { Duration } from "#time/Duration.js";
import { Hours } from "#time/TimeUnit.js";
import { Abort } from "#util/Abort.js";
import { Bytes } from "#util/Bytes.js";
import { Gzip } from "#util/Gzip.js";
import { BasicMultiplex } from "#util/Multiplex.js";
import type { Directory } from "../../fs/Directory.js";
import { type CloneableStorage, StorageDriver, StorageError } from "../StorageDriver.js";
import type { SupportedStorageTypes } from "../StringifyTools.js";
import { WalCleaner } from "./WalCleaner.js";
import {
    type WalCommitId,
    compareCommitIds,
    compressedSegmentFilename,
    encodeContextKey,
    parseSegmentFilename,
    segmentFilename,
} from "./WalCommit.js";
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
export class WalStorage extends StorageDriver implements CloneableStorage {
    static readonly id = "wal";

    static create(dir: Directory, descriptor: WalStorage.Descriptor) {
        return new WalStorage(dir, {
            maxSegmentSize: descriptor.maxSegmentSize,
            fsync: descriptor.fsync,
            compressSnapshot: descriptor.compressSnapshot,
            compressLog: descriptor.compressLog,
            headSnapshot: descriptor.headSnapshot,
        });
    }

    readonly #storageDir: Directory;
    readonly #options: WalStorage.Options;
    #cache?: StoreData;
    #abort = new Abort();
    #workers = new BasicMultiplex();
    #initialized = false;
    #lastCommitId?: WalCommitId;
    #lastCommitTs?: number;
    #lastSnapshotCommitId?: WalCommitId;
    #writer?: WalWriter;
    #reader?: WalReader;
    #cleaner?: WalCleaner;
    #compressSnapshot = true;

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
        this.#lastCommitTs = undefined;
        this.#lastSnapshotCommitId = undefined;

        await this.#storageDir.mkdir();

        const walDir = this.#storageDir.directory("wal");
        await walDir.mkdir();

        const compressLog = this.#options.compressLog ?? WalStorage.defaults.compressLog;

        this.#reader = new WalReader(walDir);
        this.#writer = new WalWriter(walDir, {
            maxSegmentSize: this.#options.maxSegmentSize,
            fsync: this.#options.fsync,
            onRotate: compressLog
                ? () => {
                      this.#workers.add(this.#compressRotatedSegments(), "wal-compress");
                  }
                : undefined,
        });
        this.#compressSnapshot = this.#options.compressSnapshot ?? WalStorage.defaults.compressSnapshot;

        const headSnapshot = this.#options.headSnapshot ?? WalStorage.defaults.headSnapshot;
        this.#cleaner = new WalCleaner(
            walDir,
            headSnapshot
                ? {
                      dir: this.#storageDir,
                      compress: this.#compressSnapshot,
                      reader: this.#reader,
                  }
                : undefined,
        );

        // Start background workers
        const snapshotInterval = this.#options.snapshotInterval ?? WalStorage.defaults.snapshotInterval;
        this.#workers.add(
            this.#runWorker("wal-snapshot", snapshotInterval, () => this.#runSnapshot()),
            "wal-snapshot",
        );

        const cleanInterval = this.#options.cleanInterval ?? WalStorage.defaults.cleanInterval;
        if (cleanInterval !== undefined) {
            this.#workers.add(
                this.#runWorker("wal-clean", cleanInterval, () => this.#runClean()),
                "wal-clean",
            );
        }

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

    async clone(): Promise<StorageDriver> {
        this.#assertInitialized();

        // Flush current state to snapshot so the copy is consistent
        await this.#runSnapshot();

        // Copy the entire storage directory to a temp location
        const tempDir = this.#storageDir.fs.tempDirectory();
        await this.#storageDir.fs.copy(this.#storageDir, tempDir);

        // Return a new WalStorage backed by the copy
        const clone = new WalStorage(tempDir, this.#options);
        await clone.initialize();
        return clone;
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

    // --- Transactions ---

    override async begin(): Promise<WalTransaction> {
        this.#assertInitialized();
        return new WalTransaction(this, this.#writer!, (id, ts) => {
            this.#lastCommitId = id;
            this.#lastCommitTs = ts;
            this.#cache = undefined;
        });
    }

    // --- Snapshot reconstruction ---

    /**
     * Reconstruct a snapshot as of the given timestamp.
     *
     * If `asOf` is omitted, returns the full current state.
     */
    async snapshotAtTime(asOf?: number): Promise<WalSnapshot> {
        this.#assertInitialized();

        if (asOf !== undefined && asOf > Date.now()) {
            throw new StorageError("Timestamp is in the future");
        }

        return this.#reconstruct(
            asOf !== undefined ? (_id, commitTs) => commitTs > asOf : undefined,
            asOf !== undefined
                ? baseTs => {
                      if (baseTs > 0 && asOf < baseTs) {
                          throw new StorageError("Timestamp predates available logs");
                      }
                  }
                : undefined,
        );
    }

    /**
     * Reconstruct a snapshot at the given commit ID.
     *
     * If `commitId` is omitted, returns the full current state.
     */
    async snapshotAtCommit(commitId?: WalCommitId): Promise<WalSnapshot> {
        this.#assertInitialized();

        return this.#reconstruct(
            commitId !== undefined ? (id, _commitTs) => compareCommitIds(id, commitId) > 0 : undefined,
        );
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
        const snap = await WalSnapshot.load(this.#storageDir);
        if (snap) {
            Object.assign(store, snap.data);
            afterCommitId = snap.commitId;
            this.#lastSnapshotCommitId = snap.commitId;
            this.#lastCommitTs = snap.ts || undefined;
            logger.debug("Loaded snapshot at commit", snap.commitId);
        }

        // Replay WAL from after the snapshot (or from the beginning)
        let replayCount = 0;
        for await (const { id, commit } of this.#reader!.read(afterCommitId)) {
            applyCommit(store, commit);
            this.#lastCommitId = id;
            this.#lastCommitTs = commit.ts || this.#lastCommitTs;
            replayCount++;
        }
        if (replayCount > 0) {
            logger.debug(`Replayed ${replayCount} WAL commits`);
        } else if (afterCommitId) {
            this.#lastCommitId = afterCommitId;
        }

        this.#cache = store;
        return store;
    }

    /**
     * Shared reconstruction logic for snapshotAtTime/snapshotAtCommit.
     *
     * @param shouldStop - if provided, called for each commit; return true to stop before applying that commit
     * @param validateBase - if provided, called with the base snapshot ts for pre-condition checks
     */
    async #reconstruct(
        shouldStop?: (id: WalCommitId, commitTs: number) => boolean,
        validateBase?: (baseTs: number) => void,
    ): Promise<WalSnapshot> {
        const store: StoreData = {};
        let afterCommitId: WalCommitId | undefined;
        let lastId: WalCommitId | undefined;
        let lastTs = 0;

        // Load base snapshot
        const snap = await WalSnapshot.load(this.#storageDir);
        if (snap) {
            Object.assign(store, snap.data);
            afterCommitId = snap.commitId;
            lastId = snap.commitId;
            lastTs = snap.ts;
        }

        validateBase?.(lastTs);

        // Replay WAL commits
        for await (const { id, commit } of this.#reader!.read(afterCommitId)) {
            if (shouldStop?.(id, commit.ts)) {
                break;
            }
            applyCommit(store, commit);
            lastId = id;
            lastTs = commit.ts || lastTs;
        }

        if (!lastId) {
            throw new StorageError("No data available");
        }

        return new WalSnapshot(lastId, lastTs, store);
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
            const snapshot = new WalSnapshot(this.#lastCommitId, this.#lastCommitTs ?? 0, store);
            await snapshot.save(this.#storageDir, { compress: this.#compressSnapshot });
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

    async #compressRotatedSegments(): Promise<void> {
        const walDir = this.#storageDir.directory("wal");
        if (!(await walDir.exists())) return;

        const activeSegment = this.#writer!.currentSegment;

        for await (const entry of walDir.entries()) {
            if (entry.kind !== "file") continue;
            if (!entry.name.endsWith(".jsonl")) continue;

            const seg = parseSegmentFilename(entry.name);
            if (seg === undefined || seg === activeSegment) continue;

            try {
                const gzName = compressedSegmentFilename(seg);
                const gzFile = walDir.file(gzName);

                if (await gzFile.exists()) {
                    // Compressed file already exists — just remove the original
                    await entry.delete();
                    continue;
                }

                const srcFile = walDir.file(segmentFilename(seg));
                const tmpName = gzName + ".tmp";
                const tmpFile = walDir.file(tmpName);

                await tmpFile.write(Gzip.compress(srcFile.readBytes()));
                await tmpFile.rename(gzName);
                await srcFile.delete();
            } catch (e) {
                logger.warn(`Failed to compress WAL segment ${seg}:`, e);
            }
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
    export interface Descriptor extends StorageDriver.Descriptor {
        /**
         * Maximum WAL segment size in bytes.
         */
        maxSegmentSize?: number;

        /**
         * Whether to fsync after each WAL write.
         */
        fsync?: boolean;

        /**
         * Whether to gzip-compress snapshots.  Defaults to true if the runtime supports gzip.
         */
        compressSnapshot?: boolean;

        /**
         * Whether to gzip-compress rotated WAL segments.  Defaults to true if the runtime supports gzip.
         */
        compressLog?: boolean;

        /**
         * Whether to capture a head snapshot at the truncation boundary when cleaning old WAL segments.
         */
        headSnapshot?: boolean;
    }

    export interface Options {
        /**
         * Maximum WAL segment size in bytes before the writer rotates to a new file.
         */
        maxSegmentSize?: number;

        /**
         * Whether to fsync after each WAL write for durability against unexpected process termination.
         */
        fsync?: boolean;

        /**
         * Interval between periodic snapshots that consolidate WAL state into a single file.
         */
        snapshotInterval?: Duration;

        /**
         * Interval between periodic WAL cleanup that removes segments already captured in a snapshot.  Undefined
         * disables cleanup.
         */
        cleanInterval?: Duration;

        /**
         * Whether to gzip-compress snapshots.  Defaults to true if the runtime supports gzip.
         */
        compressSnapshot?: boolean;

        /**
         * Whether to gzip-compress rotated WAL segments.  Defaults to true if the runtime supports gzip.
         */
        compressLog?: boolean;

        /**
         * Whether to capture a head snapshot at the truncation boundary when cleaning old WAL segments.
         */
        headSnapshot?: boolean;
    }

    export const defaults = {
        maxSegmentSize: 16 * 1024 * 1024,
        fsync: true,
        snapshotInterval: Hours(6),
        cleanInterval: undefined as Duration | undefined,
        compressSnapshot: Gzip.isAvailable,
        compressLog: Gzip.isAvailable,
        headSnapshot: true,
    } as const satisfies { [K in keyof Required<Options>]: Options[K] };
}
