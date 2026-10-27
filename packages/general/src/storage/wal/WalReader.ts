/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import type { Directory } from "../../fs/Directory.js";
import { type WalCommit, type WalCommitId, compareCommitIds, deserializeCommit } from "./WalCommit.js";
import { readGzipText } from "./WalFiles.js";
import { type WalSegment, listSegments } from "./WalSegments.js";

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
        return (await listSegments(this.#walDir)).map(files => files.segment);
    }

    /**
     * Read all commits after the given commit ID.
     */
    async *read(after?: WalCommitId): AsyncIterable<{ id: WalCommitId; commit: WalCommit }> {
        for (const files of await listSegments(this.#walDir)) {
            const { segment } = files;
            if (after && segment < after.segment) {
                continue;
            }

            let lineNumber = 0;

            for await (const line of this.#readLines(files)) {
                const offset = lineNumber;
                lineNumber++;

                // Skip empty lines (e.g. trailing newline)
                if (line.trim() === "") {
                    continue;
                }

                const id: WalCommitId = { segment, offset };

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

    async *#readLines({ original, compressed }: WalSegment): AsyncIterable<string> {
        if (compressed !== undefined) {
            yield* (await readGzipText(this.#walDir.file(compressed))).split("\n");
        } else if (original !== undefined) {
            yield* this.#walDir.file(original).readText({ lines: true });
        }
    }
}
