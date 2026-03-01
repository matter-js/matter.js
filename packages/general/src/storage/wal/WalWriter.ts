/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Directory } from "../../fs/Directory.js";
import type { File } from "../../fs/File.js";
import {
    MAX_SEGMENT_LINES,
    type WalCommitId,
    type WalOp,
    isCompressedSegmentFile,
    parseSegmentFilename,
    segmentFilename,
    serializeCommit,
} from "./WalCommit.js";

/**
 * Manages the current WAL segment and writes commits.
 */
export class WalWriter {
    readonly #walDir: Directory;
    readonly #maxSegmentSize: number;
    readonly #fsync: boolean;
    readonly #onRotate?: (closedSegment: number) => void;

    #handle?: File.Handle;
    #currentSegment = 0;
    #currentOffset = 0;
    #currentSize = 0;

    constructor(walDir: Directory, options?: WalWriter.Options) {
        this.#walDir = walDir;
        this.#maxSegmentSize = options?.maxSegmentSize ?? 16 * 1024 * 1024; // 16 MB default
        this.#fsync = options?.fsync ?? true;
        this.#onRotate = options?.onRotate;
    }

    /**
     * The segment number currently being written to.
     */
    get currentSegment(): number {
        return this.#currentSegment;
    }

    /**
     * Write a commit to the WAL, returning its commit ID and timestamp.
     */
    async write(ops: WalOp[]): Promise<{ id: WalCommitId; ts: number }> {
        if (!this.#handle) {
            await this.#openSegment();
        }

        // Check if rotation is needed (size threshold or line overflow)
        if (
            this.#currentSize > 0 &&
            (this.#currentSize >= this.#maxSegmentSize || this.#currentOffset >= MAX_SEGMENT_LINES)
        ) {
            await this.#rotate();
        }

        const ts = Date.now();
        const line = serializeCommit({ ts, ops }) + "\n";
        const id: WalCommitId = { segment: this.#currentSegment, offset: this.#currentOffset };

        await this.#handle!.writeHandle(line);
        if (this.#fsync) {
            await this.#handle!.fsync();
        }

        this.#currentOffset++;
        this.#currentSize += new TextEncoder().encode(line).length;

        return { id, ts };
    }

    /**
     * Close the current file handle.
     */
    async close(): Promise<void> {
        if (this.#handle) {
            await this.#handle.close();
            this.#handle = undefined;
        }
    }

    async #openSegment(): Promise<void> {
        await this.#walDir.mkdir();

        // Scan existing segments to determine the next segment number
        let maxSegment = 0;
        let maxSegmentCompressed = false;
        if (await this.#walDir.exists()) {
            for await (const entry of this.#walDir.entries()) {
                if (entry.kind !== "file") continue;
                const seg = parseSegmentFilename(entry.name);
                if (seg !== undefined) {
                    if (seg > maxSegment) {
                        maxSegment = seg;
                        maxSegmentCompressed = isCompressedSegmentFile(entry.name);
                    } else if (seg === maxSegment && isCompressedSegmentFile(entry.name)) {
                        maxSegmentCompressed = true;
                    }
                }
            }
        }

        if (maxSegment > 0) {
            // If the max segment is compressed, we can't append — start a new one
            if (maxSegmentCompressed) {
                this.#currentSegment = maxSegment + 1;
            } else {
                // Check how many lines exist in the last segment
                const lastFile = this.#walDir.file(segmentFilename(maxSegment));
                let lineCount = 0;
                let byteSize = 0;
                for await (const line of lastFile.readText({ lines: true })) {
                    if (line.trim() !== "") {
                        lineCount++;
                    }
                    byteSize += new TextEncoder().encode(line + "\n").length;
                }

                if (byteSize < this.#maxSegmentSize && lineCount < MAX_SEGMENT_LINES) {
                    // Append to existing segment
                    this.#currentSegment = maxSegment;
                    this.#currentOffset = lineCount;
                    this.#currentSize = byteSize;
                    this.#handle = await lastFile.open("a");
                    return;
                }

                // Start a new segment
                this.#currentSegment = maxSegment + 1;
            }
        } else {
            this.#currentSegment = 1;
        }

        this.#currentOffset = 0;
        this.#currentSize = 0;
        const file = this.#walDir.file(segmentFilename(this.#currentSegment));
        this.#handle = await file.open("a");
    }

    async #rotate(): Promise<void> {
        if (this.#handle) {
            await this.#handle.close();
        }
        const closedSegment = this.#currentSegment;
        this.#currentSegment++;
        this.#currentOffset = 0;
        this.#currentSize = 0;
        const file = this.#walDir.file(segmentFilename(this.#currentSegment));
        this.#handle = await file.open("a");
        this.#onRotate?.(closedSegment);
    }
}

export namespace WalWriter {
    export interface Options {
        /** Maximum segment size in bytes before rotation. Default 16 MB. */
        maxSegmentSize?: number;
        /** Whether to fsync after each write. Default true. */
        fsync?: boolean;
        /** Called after a segment is rotated, with the closed segment number. */
        onRotate?: (closedSegment: number) => void;
    }
}
