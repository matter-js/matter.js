/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import type { Directory } from "../../fs/Directory.js";
import {
    type WalCommit,
    type WalCommitId,
    compareCommitIds,
    deserializeCommit,
    parseSegmentFilename,
} from "./WalCommit.js";

const logger = Logger.get("WalReader");

/**
 * Reads WAL commit entries from segment files in a `wal/` directory.
 */
export class WalReader {
    readonly #walDir: Directory;

    constructor(walDir: Directory) {
        this.#walDir = walDir;
    }

    /**
     * List available WAL segment numbers, sorted ascending.
     */
    async segments(): Promise<number[]> {
        if (!(await this.#walDir.exists())) {
            return [];
        }
        const segments: number[] = [];
        for await (const entry of this.#walDir.entries()) {
            if (entry.kind !== "file") continue;
            const seg = parseSegmentFilename(entry.name);
            if (seg !== undefined) {
                segments.push(seg);
            }
        }
        return segments.sort((a, b) => a - b);
    }

    /**
     * Read all commits after the given commit ID.
     */
    async *read(after?: WalCommitId): AsyncIterable<{ id: WalCommitId; commit: WalCommit }> {
        const segmentNumbers = await this.segments();

        for (const segment of segmentNumbers) {
            // Skip segments entirely before the after point
            if (after && segment < after.segment) {
                continue;
            }

            const file = this.#walDir.file(segment.toString(16).padStart(8, "0") + ".jsonl");
            let lineNumber = 0;

            for await (const line of file.readText({ lines: true })) {
                const offset = lineNumber;
                lineNumber++;

                // Skip empty lines (e.g. trailing newline)
                if (line.trim() === "") {
                    continue;
                }

                const id: WalCommitId = { segment, offset };

                // Skip commits at or before the after point
                if (after && compareCommitIds(id, after) <= 0) {
                    continue;
                }

                try {
                    const commit = deserializeCommit(line);
                    yield { id, commit };
                } catch (e) {
                    logger.warn(`Skipping malformed WAL line at segment ${segment}, offset ${offset}:`, e);
                }
            }
        }
    }
}
