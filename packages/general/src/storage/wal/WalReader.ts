/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import { Gzip } from "#util/Gzip.js";
import type { Directory } from "../../fs/Directory.js";
import {
    type WalCommit,
    type WalCommitId,
    compareCommitIds,
    compressedSegmentFilename,
    deserializeCommit,
    parseSegmentFilename,
    segmentFilename,
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
        const segments = new Set<number>();
        for await (const entry of this.#walDir.entries()) {
            if (entry.kind !== "file") continue;
            const seg = parseSegmentFilename(entry.name);
            if (seg !== undefined) {
                segments.add(seg);
            }
        }
        return [...segments].sort((a, b) => a - b);
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

            let lineNumber = 0;

            for await (const line of this.#readSegmentLines(segment)) {
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

    /**
     * Read lines from a segment, transparently handling gzip-compressed files.
     */
    async *#readSegmentLines(segment: number): AsyncIterable<string> {
        // Prefer compressed file if it exists
        const gzFile = this.#walDir.file(compressedSegmentFilename(segment));
        if (await gzFile.exists()) {
            const chunks = Array<Uint8Array>();
            for await (const chunk of Gzip.decompress(gzFile.readBytes())) {
                chunks.push(chunk);
            }
            const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
            const combined = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
                combined.set(chunk, offset);
                offset += chunk.length;
            }
            const text = new TextDecoder().decode(combined);
            for (const line of text.split("\n")) {
                yield line;
            }
            return;
        }

        // Fall back to uncompressed file
        const file = this.#walDir.file(segmentFilename(segment));
        yield* file.readText({ lines: true });
    }
}
