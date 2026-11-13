/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { StorageError } from "../StorageDriver.js";
import { type SupportedStorageTypes, fromJson, toJson } from "../StringifyTools.js";
import { MAX_SEGMENT, MAX_SEGMENT_LINES, type StoreData, type WalCommitId } from "./WalCommit.js";

/**
 * The WAL storage state as of a specific commit.  `WalSnapshotStore` writes and reads it as a file.
 */
export class WalSnapshot {
    readonly commitId: WalCommitId;
    readonly ts: number;
    readonly data: StoreData;

    /**
     * Commit of the snapshot this one replaced, which the store keeps as the backup.
     */
    readonly backupCommitId?: WalCommitId;

    constructor(commitId: WalCommitId, ts: number, data: StoreData, backupCommitId?: WalCommitId) {
        this.commitId = commitId;
        this.ts = ts;
        this.data = data;
        this.backupCommitId = backupCommitId;
    }

    /**
     * Serialize to JSON.  Runs synchronously, so the caller may change {@link data} right after it returns.
     */
    serialize(): string {
        const snapshot: SupportedStorageTypes = {
            commitId: this.commitId,
            ts: this.ts,
            data: this.data,
            ...(this.backupCommitId ? { backupCommitId: this.backupCommitId } : {}),
        };
        return toJson(snapshot, 2);
    }

    /**
     * Parse the JSON {@link serialize} writes.  Throws a {@link StorageError} naming {@link source} if the text is not
     * JSON or does not have the snapshot structure.
     */
    static parse(text: string, source: string): WalSnapshot {
        let parsed: unknown;
        try {
            parsed = fromJson(text);
        } catch (cause) {
            throw new StorageError(`Snapshot ${source} is unreadable`, { cause });
        }
        if (!isPlainRecord(parsed)) {
            throw new StorageError(`Snapshot ${source} is not an object`);
        }
        const { commitId, ts, data, backupCommitId } = parsed;
        if (!isCommitId(commitId)) {
            throw new StorageError(`Snapshot ${source} has no valid commitId`);
        }
        if (!isStoreData(data)) {
            throw new StorageError(`Snapshot ${source} data is not an object of contexts`);
        }
        if (backupCommitId !== undefined && !isCommitId(backupCommitId)) {
            throw new StorageError(`Snapshot ${source} has an invalid backupCommitId`);
        }
        return new WalSnapshot(commitId, typeof ts === "number" ? ts : 0, data, backupCommitId);
    }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isStoreData(value: unknown): value is StoreData {
    return isPlainRecord(value) && Object.values(value).every(isPlainRecord);
}

function isCommitId(value: unknown): value is WalCommitId {
    return (
        isPlainRecord(value) &&
        isIntegerInRange(value.segment, MAX_SEGMENT) &&
        isIntegerInRange(value.offset, MAX_SEGMENT_LINES)
    );
}

function isIntegerInRange(value: unknown, max: number): boolean {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}
