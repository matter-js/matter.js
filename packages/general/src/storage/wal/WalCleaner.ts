/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Directory } from "../../fs/Directory.js";
import type { SupportedStorageTypes } from "../StringifyTools.js";
import { type WalCommitId, parseSegmentFilename } from "./WalCommit.js";
import type { WalReader } from "./WalReader.js";
import { WalSnapshot } from "./WalSnapshot.js";
import { applyCommit } from "./WalTransaction.js";

type StoreData = Record<string, Record<string, SupportedStorageTypes>>;

/**
 * Prunes old WAL segments that have been fully captured in a snapshot.
 */
export class WalCleaner {
    readonly #walDir: Directory;
    readonly #options?: WalCleaner.Options;

    constructor(walDir: Directory, options?: WalCleaner.Options) {
        this.#walDir = walDir;
        this.#options = options;
    }

    /**
     * Remove WAL segments where all commits are ≤ the snapshot commit ID.
     *
     * A segment is safe to delete only if its segment number is strictly less than the snapshot's segment number (since
     * the snapshot segment itself may have un-snapshotted commits at higher offsets).
     */
    async run(lastSnapshotCommitId: WalCommitId): Promise<void> {
        if (!(await this.#walDir.exists())) {
            return;
        }

        const toDelete: { name: string; segment: number }[] = [];

        for await (const entry of this.#walDir.entries()) {
            if (entry.kind !== "file") continue;
            const segment = parseSegmentFilename(entry.name);
            if (segment === undefined) continue;

            // Only delete segments strictly before the snapshot's segment
            if (segment < lastSnapshotCommitId.segment) {
                toDelete.push({ name: entry.name, segment });
            }
        }

        if (toDelete.length === 0) {
            return;
        }

        // Build head snapshot before deleting segments
        if (this.#options?.dir && this.#options.reader) {
            await this.#buildHeadSnapshot(lastSnapshotCommitId);
        }

        // Delete oldest first
        toDelete.sort((a, b) => a.segment - b.segment);
        for (const { name } of toDelete) {
            await this.#walDir.file(name).delete();
        }
    }

    /**
     * Replay commits from the segments about to be deleted and save them as a head snapshot.
     */
    async #buildHeadSnapshot(lastSnapshotCommitId: WalCommitId): Promise<void> {
        const { dir, compress, reader } = this.#options!;

        // Load previous head snapshot as base state
        const existing = await WalSnapshot.load(dir!, { basename: "head" });
        const store: StoreData = existing?.data ?? {};
        const baseCommitId = existing?.commitId;
        let lastTs = existing?.ts ?? 0;

        // Replay commits from base through the deletion boundary
        let lastAppliedId: WalCommitId | undefined = baseCommitId;
        for await (const { id, commit } of reader!.read(baseCommitId)) {
            // Stop once we reach the snapshot's segment (those segments are kept)
            if (id.segment >= lastSnapshotCommitId.segment) {
                break;
            }
            applyCommit(store, commit);
            lastAppliedId = id;
            lastTs = commit.ts || lastTs;
        }

        if (lastAppliedId) {
            const snapshot = new WalSnapshot(lastAppliedId, lastTs, store);
            await snapshot.save(dir!, { compress, basename: "head" });
        }
    }
}

export namespace WalCleaner {
    export interface Options {
        /**
         * Directory for storing the head snapshot.
         */
        dir?: Directory;

        /**
         * Whether to compress the head snapshot.
         */
        compress?: boolean;

        /**
         * Reader for replaying WAL segments before they are deleted.
         */
        reader?: WalReader;
    }
}
