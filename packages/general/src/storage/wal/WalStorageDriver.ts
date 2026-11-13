/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic } from "#log/Diagnostic.js";
import { Logger } from "#log/Logger.js";
import type { Duration } from "#time/Duration.js";
import { Hours } from "#time/TimeUnit.js";
import { Abort } from "#util/Abort.js";
import { Gzip } from "#util/Gzip.js";
import { BasicMultiplex } from "#util/Multiplex.js";
import { Mutex } from "#util/Mutex.js";
import type { Directory } from "../../fs/Directory.js";
import type { DataNamespace } from "../DataNamespace.js";
import { type CloneableStorage, FilesystemStorageDriver, StorageDriver, StorageError } from "../StorageDriver.js";
import type { SupportedStorageTypes } from "../StringifyTools.js";
import { type StoreData, type WalCommitId, compareCommitIds } from "./WalCommit.js";
import { WalReader } from "./WalReader.js";
import { compressSegmentsBefore, deleteSegmentsBefore } from "./WalSegments.js";
import { WalSnapshot } from "./WalSnapshot.js";
import { WalSnapshotStore } from "./WalSnapshotStore.js";
import { WalTransaction, applyCommit } from "./WalTransaction.js";
import { WalWriter } from "./WalWriter.js";

const logger = Logger.get("WalStorageDriver");

/**
 * Transactional storage backend using a write-ahead log (WAL).
 *
 * {@link initialize} loads the snapshot and replays the WAL into memory before any read or write is possible.  Reads
 * use that copy; each commit is appended to the WAL and then applied to it.
 */
export class WalStorageDriver extends FilesystemStorageDriver implements CloneableStorage {
    static readonly id = "wal";

    static async create(namespace: DataNamespace, descriptor: WalStorageDriver.Descriptor) {
        const storage = new WalStorageDriver(namespace, {
            maxSegmentSize: descriptor.maxSegmentSize,
            fsync: descriptor.fsync,
            compressSnapshot: descriptor.compressSnapshot,
            compressLog: descriptor.compressLog,
        });
        try {
            await storage.initialize();
        } catch (error) {
            await storage
                .close()
                .catch(closeError => logger.warn("Closing storage after a failed open failed:", closeError));
            throw error;
        }
        return storage;
    }

    readonly #storageDir: Directory;
    readonly #walDir: Directory;
    readonly #options: WalStorageDriver.Options;
    readonly #snapshots: WalSnapshotStore;
    #state?: OpenState;
    #abort = new Abort();
    #workers = new BasicMultiplex();
    #maintenance = new Mutex(this);

    constructor(namespace?: DataNamespace, options?: WalStorageDriver.Options) {
        super(namespace);
        this.#storageDir = options?.storageDir ?? this.root!.directory;
        this.#walDir = this.#storageDir.directory("wal");
        this.#options = options ?? {};
        this.#snapshots = new WalSnapshotStore(this.#storageDir);
    }

    get initialized() {
        return this.#state !== undefined;
    }

    override async initialize(): Promise<void> {
        if (this.#state) {
            throw new StorageError("WalStorageDriver already initialized");
        }

        await super.initialize();
        try {
            await this.#open();
        } catch (error) {
            await super.close();
            throw error;
        }
    }

    async #open() {
        this.#abort = new Abort();
        this.#workers = new BasicMultiplex();
        this.#maintenance = new Mutex(this);

        await this.#storageDir.mkdir();

        const walDir = this.#walDir;
        await walDir.mkdir();

        const reader = new WalReader(walDir);
        const segments = await reader.segments();
        const loaded = await this.#load(reader, segments);
        const firstSegment = Math.max(loaded.lastCommitId?.segment ?? 0, ...segments) + 1;

        const compressLog = this.#options.compressLog ?? WalStorageDriver.defaults.compressLog;
        const writer = new WalWriter(walDir, {
            name: this.root?.namespace,
            maxSegmentSize: this.#options.maxSegmentSize,
            fsync: this.#options.fsync,
            firstSegment,
            onRotate: compressLog
                ? () => {
                      this.#maintenance.run(() => this.#compressRotatedSegments());
                  }
                : undefined,
        });
        this.#state = { ...loaded, writer };

        this.#workers.add(this.#runSnapshotWorker(), "wal-snapshot");
    }

    override async close(): Promise<void> {
        this.#abort();
        await this.#workers;

        const state = this.#state;
        if (state) {
            // The store already holds every commit, so the snapshot saves them even if the last segment close failed
            await state.writer
                .close()
                .catch(error => logger.warn(`Closing the WAL writer of ${this.#storageDir.path} failed:`, error));
            await this.#snapshotAndClean();
        }
        await this.#maintenance.close();
        this.#state = undefined;

        await super.close();
    }

    async clone(): Promise<StorageDriver> {
        this.#requireState();

        // Snapshot and copy in one maintenance task, so no compression or cleanup changes files during the copy
        const tempDir = this.#storageDir.fs.tempDirectory();
        await this.#maintenance.produce(async () => {
            await this.#runSnapshot();
            await this.#storageDir.fs.copy(this.#storageDir, tempDir);
        });

        // Return a new WalStorageDriver backed by the copy (no root lock for the clone)
        const clone = new WalStorageDriver(undefined, { ...this.#options, storageDir: tempDir });
        try {
            await clone.initialize();
        } catch (error) {
            await tempDir
                .delete()
                .catch(deleteError => logger.warn(`Deleting clone directory ${tempDir.path} failed:`, deleteError));
            throw error;
        }
        return clone;
    }

    // --- Read operations (from the in-memory copy) ---

    async get(contexts: string[], key: string): Promise<SupportedStorageTypes | undefined> {
        const { store } = this.#requireState();
        const contextKey = this.#contextKey(contexts);
        return store[contextKey]?.[key];
    }

    async keys(contexts: string[]): Promise<string[]> {
        const { store } = this.#requireState();
        const contextKey = this.#contextKey(contexts);
        return Object.keys(store[contextKey] ?? {});
    }

    async values(contexts: string[]): Promise<Record<string, SupportedStorageTypes>> {
        const { store } = this.#requireState();
        const contextKey = this.#contextKey(contexts);
        return { ...(store[contextKey] ?? {}) };
    }

    async contexts(contexts: string[]): Promise<string[]> {
        const { store } = this.#requireState();
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
        await using tx = await this.begin();
        if (typeof keyOrValues === "string") {
            await tx.set(contexts, keyOrValues, value!);
        } else {
            await tx.set(contexts, keyOrValues);
        }
        await tx.commit();
    }

    async delete(contexts: string[], key: string): Promise<void> {
        await using tx = await this.begin();
        await tx.delete(contexts, key);
        await tx.commit();
    }

    async clearAll(contexts: string[]): Promise<void> {
        await using tx = await this.begin();
        await tx.clearAll(contexts);
        await tx.commit();
    }

    // --- Transactions ---

    override async begin(): Promise<WalTransaction> {
        const state = this.#requireState();
        return new WalTransaction(this, state.writer, (id, ts, ops) => {
            state.lastCommitId = id;
            state.lastCommitTs = ts;
            applyCommit(state.store, { ts, ops });
        });
    }

    // --- Internal ---

    #requireState(): OpenState {
        if (this.#state === undefined) {
            throw new StorageError("WalStorageDriver is not initialized");
        }
        return this.#state;
    }

    /**
     * Restore the snapshot and replay the WAL after it.
     */
    async #load(reader: WalReader, segments: number[]): Promise<StoreState> {
        const loaded: StoreState = { store: {} };

        const restored = await this.#snapshots.restore();
        this.#assertWalCovers(segments, restored?.snapshot.commitId);
        if (restored) {
            const { snapshot, backupCommitId } = restored;
            Object.assign(loaded.store, snapshot.data);
            loaded.lastCommitId = loaded.lastSnapshotCommitId = snapshot.commitId;
            loaded.lastCommitTs = snapshot.ts || undefined;
            loaded.backupCommitId = backupCommitId;
            logger.debug("Loaded snapshot at commit", snapshot.commitId);
        }

        let replayCount = 0;
        const elapsed = Diagnostic.elapsed();
        for await (const { id, commit } of reader.read(loaded.lastCommitId)) {
            if (replayCount === 0) {
                logger.notice(
                    `Restoring storage ${this.#storageDir.path} from its log, which the last stop did not fully save; this can take a while`,
                );
            }
            applyCommit(loaded.store, commit);
            loaded.lastCommitId = id;
            loaded.lastCommitTs = commit.ts || loaded.lastCommitTs;
            replayCount++;
        }
        if (replayCount > 0) {
            loaded.restoredFromLog = true;
            logger.notice(
                `Restored ${replayCount} log entries of ${this.#storageDir.path} in ${elapsed}; saving the restored state, this can take a while`,
            );
        }

        return loaded;
    }

    /**
     * Throw if WAL segments that may hold commits after the snapshot at {@link commitId}, or after an empty store when
     * there is no snapshot, are missing, because a replay would skip them.
     *
     * Writers number segments without gaps.  After the WAL was lost, the next run starts at the snapshot's segment + 1,
     * so every segment from there on must exist up to the newest one.  Without a snapshot, the first writer started at
     * segment 1.  A missing tail of a segment cannot be detected, the same as a fully missing WAL.
     *
     * @param segments all segment numbers on disk, in ascending order
     */
    #assertWalCovers(segments: number[], commitId: WalCommitId | undefined) {
        const firstNeeded = commitId === undefined ? 1 : commitId.segment + 1;
        const missing = segments
            .filter(segment => segment >= firstNeeded)
            .findIndex((segment, index) => segment !== firstNeeded + index);
        if (missing === -1) {
            return;
        }
        const base = commitId === undefined ? "No snapshot" : `Snapshot at WAL segment ${commitId.segment}`;
        throw new StorageError(
            `${base} in ${this.#storageDir.path} cannot be restored because WAL segment ${firstNeeded + missing} is missing`,
        );
    }

    /**
     * Snapshot and clean right away and then every snapshot interval until {@link close} aborts it.
     *
     * The first run snapshots what an unclean stop left in the WAL, so the following open does not replay it again.
     * After a clean stop it writes no snapshot.
     */
    async #runSnapshotWorker(): Promise<void> {
        const interval = this.#options.snapshotInterval ?? WalStorageDriver.defaults.snapshotInterval;
        while (!this.#abort.aborted) {
            try {
                await this.#snapshotAndClean();
            } catch (e) {
                logger.warn("WAL snapshot worker error:", e);
            }
            await this.#abort.sleep("wal-snapshot", interval);
        }
    }

    /**
     * Write a snapshot if anything was committed since the last one, then delete the WAL segments before the backup
     * snapshot.
     *
     * Runs in the maintenance mutex so it never overlaps segment compression or another snapshot.
     */
    #snapshotAndClean(): Promise<void> {
        return this.#maintenance.produce(async () => {
            await this.#runSnapshot();
            await this.#runClean();
        });
    }

    /**
     * Write a snapshot unless nothing was committed since the last one.
     */
    async #runSnapshot(): Promise<void> {
        const state = this.#requireState();
        const { store, lastCommitId: commitId, lastSnapshotCommitId } = state;
        if (commitId === undefined) return;
        try {
            if (lastSnapshotCommitId !== undefined && compareCommitIds(commitId, lastSnapshotCommitId) === 0) {
                return;
            }

            const announce = state.restoredFromLog;
            state.restoredFromLog = false;
            const elapsed = Diagnostic.elapsed();
            const snapshot = new WalSnapshot(commitId, state.lastCommitTs ?? 0, store, lastSnapshotCommitId);
            await this.#snapshots.save(snapshot, {
                compress: this.#options.compressSnapshot ?? WalStorageDriver.defaults.compressSnapshot,
                fsync: this.#options.fsync ?? WalStorageDriver.defaults.fsync,
            });
            if (announce) {
                logger.notice(`Saved the restored state of ${this.#storageDir.path} in ${elapsed}`);
            }
            state.lastSnapshotCommitId = commitId;
            state.backupCommitId = lastSnapshotCommitId;
        } catch (e) {
            logger.warn(`Snapshot of ${this.#storageDir.path} failed:`, e);
        }
    }

    /**
     * Delete the WAL segments before the backup snapshot, so a fallback to the backup can still replay to the current
     * state.
     */
    async #runClean(): Promise<void> {
        const { backupCommitId } = this.#requireState();
        if (backupCommitId === undefined) return;
        try {
            await deleteSegmentsBefore(this.#walDir, backupCommitId.segment);
        } catch (e) {
            logger.warn("WAL cleanup failed:", e);
        }
    }

    async #compressRotatedSegments(): Promise<void> {
        try {
            const { writer } = this.#requireState();
            await compressSegmentsBefore(this.#walDir, writer.currentSegment, {
                fsync: this.#options.fsync ?? WalStorageDriver.defaults.fsync,
            });
        } catch (e) {
            logger.warn(`Failed to compress rotated WAL segments in ${this.#walDir.path}:`, e);
        }
    }

    #contextKey(contexts: string[]): string {
        for (const ctx of contexts) {
            if (!ctx.length || ctx.includes(".")) {
                throw new StorageError("Context must not contain empty segments or leading or trailing dots.");
            }
        }
        return contexts.join(".");
    }
}

/**
 * The in-memory data of a {@link WalStorageDriver} and the WAL position it reflects.  Commits update the store and the
 * last commit; snapshots update the snapshot commits.
 */
interface StoreState {
    store: StoreData;
    lastCommitId?: WalCommitId;
    lastCommitTs?: number;
    lastSnapshotCommitId?: WalCommitId;

    /**
     * Commit of the backup snapshot.  WAL segments before its segment may be deleted.
     */
    backupCommitId?: WalCommitId;

    /**
     * Set when the open replayed WAL entries, until the next snapshot attempt.  The open announces that snapshot,
     * because its serialization delays the open.
     */
    restoredFromLog?: boolean;
}

/**
 * The data and file access that a successful {@link WalStorageDriver.initialize} creates.  The workers and the
 * maintenance mutex stay outside, because {@link WalStorageDriver.close} must also run after a failed initialize.
 */
interface OpenState extends StoreState {
    writer: WalWriter;
}

export namespace WalStorageDriver {
    export interface Descriptor extends StorageDriver.Descriptor {
        /**
         * Maximum WAL segment size in bytes.
         */
        maxSegmentSize?: number;

        /**
         * Whether to fsync after each WAL write and before a snapshot or compressed WAL segment replaces older data.
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
    }

    export interface Options {
        /**
         * Override the storage directory.  When omitted the directory is derived from the root passed to the
         * constructor.  Used by {@link WalStorageDriver.clone} to point at a temporary copy.
         */
        storageDir?: Directory;

        /**
         * Maximum WAL segment size in bytes before the writer rotates to a new file.
         */
        maxSegmentSize?: number;

        /**
         * Whether to fsync after each WAL write and before a snapshot or compressed WAL segment replaces older data, for
         * durability against power loss.
         */
        fsync?: boolean;

        /**
         * Interval between periodic snapshots that consolidate WAL state into a single file.  After each snapshot, the
         * WAL segments before the previous snapshot are deleted, so the WAL holds up to about two intervals of writes.
         */
        snapshotInterval?: Duration;

        /**
         * Whether to gzip-compress snapshots.  Defaults to true if the runtime supports gzip.
         */
        compressSnapshot?: boolean;

        /**
         * Whether to gzip-compress rotated WAL segments.  Defaults to true if the runtime supports gzip.
         */
        compressLog?: boolean;
    }

    export const defaults = {
        maxSegmentSize: 16 * 1024 * 1024,
        fsync: true,
        snapshotInterval: Hours(6),
        compressSnapshot: Gzip.isAvailable,
        compressLog: Gzip.isAvailable,
    } as const satisfies { [K in keyof Required<Omit<Options, "storageDir">>]: Omit<Options, "storageDir">[K] };
}
