/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import { MatterAggregateError } from "#MatterError.js";
import type { Directory } from "../../fs/Directory.js";
import { Gzip } from "../../util/Gzip.js";
import { StorageError } from "../StorageDriver.js";
import type { WalCommitId } from "./WalCommit.js";
import { readGzipText, writeSynced } from "./WalFiles.js";
import { WalSnapshot } from "./WalSnapshot.js";

const logger = Logger.get("WalSnapshotStore");

const EXTENSIONS = ["json.gz", "json"] as const;
const CURRENT = "snapshot";
const BACKUP = "snapshot.prev";
const CORRUPT = "snapshot.corrupt";
const TMP = "snapshot.tmp";

/**
 * The snapshot files of a WAL storage directory.
 *
 * {@link save} keeps the snapshot it replaces as a backup and {@link restore} falls back to that backup when the
 * current snapshot is missing or unreadable.  Each file exists as `.json` or `.json.gz`:
 *
 * | File                 | Content                                                            |
 * |----------------------|--------------------------------------------------------------------|
 * | `snapshot.*`         | Current snapshot; `backupCommitId` names the backup's commit       |
 * | `snapshot.prev.*`    | Backup: the snapshot that `snapshot.*` replaced                    |
 * | `snapshot.corrupt.*` | Unreadable snapshot that `restore()` moved aside for analysis      |
 *
 * The WAL must keep every segment from the backup's commit on, so the backup can be replayed to the current state.
 */
export class WalSnapshotStore {
    readonly #dir: Directory;

    constructor(dir: Directory) {
        this.#dir = dir;
    }

    /**
     * Write {@link snapshot} and keep the snapshot it replaces as the backup.
     *
     * The write is atomic: data goes to a temporary file first and is renamed into place.  With `fsync` the data is
     * flushed to persistent storage before the rename, so a power loss cannot leave a truncated snapshot.  The
     * snapshot is serialized before the first `await`, so the caller may change its data as soon as this returns its
     * promise.
     */
    async save(snapshot: WalSnapshot, options: { compress: boolean; fsync: boolean }): Promise<void> {
        const json = snapshot.serialize();
        const extension = options.compress ? "json.gz" : "json";
        const content = options.compress ? Gzip.compress([new TextEncoder().encode(json)]) : [json];

        const tmpFile = this.#dir.file(`${TMP}.${extension}`);
        await writeSynced(tmpFile, content, options.fsync);

        if (await this.#exists(CURRENT)) {
            await this.#move(CURRENT, BACKUP);
        }
        await tmpFile.rename(`${CURRENT}.${extension}`);
    }

    /**
     * Load the current snapshot, or the backup if the current snapshot is missing or unreadable.
     *
     * When it falls back to the backup, an unreadable current snapshot is moved to `snapshot.corrupt.*`.  A backup is
     * deleted when the current snapshot has no `backupCommitId`, because a version without backups wrote that
     * snapshot and may have deleted the WAL the backup needs.  The "head" snapshot of older versions and a temporary
     * file that a crash during {@link save} left are deleted too.
     * Throws a {@link StorageError} if no readable snapshot exists although one was written before.
     *
     * @returns undefined if no snapshot was ever written
     */
    async restore(): Promise<WalSnapshotStore.Restored | undefined> {
        await this.#deleteLegacyHeadSnapshot();
        await this.#remove(TMP);

        let snapshot: WalSnapshot | undefined;
        let failure: unknown;
        try {
            snapshot = await this.#load(CURRENT);
        } catch (error) {
            failure = error;
        }

        if (snapshot) {
            if (snapshot.backupCommitId === undefined) {
                await this.#remove(BACKUP);
            }
            return { snapshot, backupCommitId: snapshot.backupCommitId };
        }

        let backup: WalSnapshot | undefined;
        try {
            backup = await this.#load(BACKUP);
        } catch (backupFailure) {
            if (failure === undefined) {
                throw backupFailure;
            }
            throw new StorageError(`Snapshot and backup snapshot in ${this.#dir.path} are unreadable`, {
                cause: new MatterAggregateError([failure, backupFailure]),
            });
        }

        if (backup === undefined) {
            if (failure !== undefined) {
                throw failure;
            }
            return undefined;
        }

        if (failure !== undefined) {
            logger.warn(
                `Snapshot in ${this.#dir.path} unreadable, restoring from the backup snapshot instead:`,
                failure,
            );
            await this.#move(CURRENT, CORRUPT);
        } else {
            logger.notice(`Snapshot in ${this.#dir.path} missing, restoring from the backup snapshot`);
        }

        return { snapshot: backup, backupCommitId: backup.commitId };
    }

    /**
     * Delete the "head" snapshot that earlier versions wrote at the cleanup boundary.  Nothing reads it.
     */
    async #deleteLegacyHeadSnapshot(): Promise<void> {
        await this.#remove("head");
        await this.#remove("head.tmp");
    }

    /**
     * Load one snapshot file, auto-detecting the format.  Throws a {@link StorageError} if the content cannot be
     * decoded or does not have the snapshot structure.
     */
    async #load(basename: string): Promise<WalSnapshot | undefined> {
        const gzFile = this.#dir.file(`${basename}.json.gz`);
        const jsonFile = this.#dir.file(`${basename}.json`);

        const gzExists = await gzFile.exists();
        const jsonExists = await jsonFile.exists();
        if (!gzExists && !jsonExists) {
            return undefined;
        }

        let useGz: boolean;
        if (gzExists && jsonExists) {
            useGz = (await gzFile.stat()).mtime >= (await jsonFile.stat()).mtime;
        } else {
            useGz = gzExists;
        }

        const source = `${this.#dir.path}/${basename}`;
        let text: string;
        try {
            text = useGz ? await readGzipText(gzFile) : await jsonFile.readAllText();
        } catch (cause) {
            throw new StorageError(`Snapshot ${source} is unreadable`, { cause });
        }
        return WalSnapshot.parse(text, source);
    }

    async #exists(basename: string) {
        for (const extension of EXTENSIONS) {
            if (await this.#dir.file(`${basename}.${extension}`).exists()) {
                return true;
            }
        }
        return false;
    }

    async #remove(basename: string) {
        for (const extension of EXTENSIONS) {
            await this.#dir.file(`${basename}.${extension}`).delete();
        }
    }

    /**
     * Move all format variants of a snapshot so that the target holds exactly what the source held.
     */
    async #move(from: string, to: string) {
        for (const extension of EXTENSIONS) {
            const source = this.#dir.file(`${from}.${extension}`);
            if (await source.exists()) {
                await source.rename(`${to}.${extension}`);
            } else {
                await this.#dir.file(`${to}.${extension}`).delete();
            }
        }
    }
}

export namespace WalSnapshotStore {
    export interface Restored {
        snapshot: WalSnapshot;

        /**
         * Commit of the snapshot that stays on disk as `snapshot.prev`.  WAL segments before this commit's segment are
         * safe to delete.  Undefined when there is no backup, so no segment is safe to delete.
         */
        backupCommitId?: WalCommitId;
    }
}
