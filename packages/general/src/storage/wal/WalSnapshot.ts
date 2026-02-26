/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Directory } from "../../fs/Directory.js";
import { type SupportedStorageTypes, fromJson, toJson } from "../StringifyTools.js";
import type { WalCommitId } from "./WalCommit.js";

type StoreData = Record<string, Record<string, SupportedStorageTypes>>;

/**
 * Manages periodic snapshots of the in-memory store.
 */
export class WalSnapshot {
    readonly #storageDir: Directory;

    constructor(storageDir: Directory) {
        this.#storageDir = storageDir;
    }

    /**
     * Load an existing snapshot from disk.
     */
    async load(): Promise<{ commitId: WalCommitId; data: StoreData } | undefined> {
        const file = this.#storageDir.file("snapshot.json");
        if (!(await file.exists())) {
            return undefined;
        }

        const text = await file.readAllText();
        const parsed = fromJson(text) as unknown as { commitId: WalCommitId; data: StoreData };

        return {
            commitId: parsed.commitId,
            data: parsed.data,
        };
    }

    /**
     * Write a snapshot of the current state to disk (atomic via write+rename).
     */
    async run(commitId: WalCommitId, currentState: StoreData): Promise<void> {
        const snapshot = {
            commitId,
            data: currentState,
        };

        const json = toJson(snapshot as unknown as SupportedStorageTypes, 2);

        // Write to temp file then rename for atomicity
        const tmpFile = this.#storageDir.file("snapshot.tmp.json");
        await tmpFile.write(json);
        await tmpFile.rename("snapshot.json");
    }
}
