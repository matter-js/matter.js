/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from "#log/Logger.js";
import { Mutex } from "#util/Mutex.js";
import type { Directory } from "../../fs/Directory.js";
import type { File } from "../../fs/File.js";
import { MAX_SEGMENT_LINES, type WalCommitId, type WalOp, serializeCommit } from "./WalCommit.js";
import { segmentFilename } from "./WalSegments.js";

const logger = Logger.get("WalWriter");

/**
 * Manages the current WAL segment and writes commits.
 *
 * The writer only ever writes to segments it created itself, starting at {@link WalWriter.Options.firstSegment}.  It
 * never appends to a segment from an earlier run or to a segment where a write failed, because such a segment may
 * end in a cut-off line that a new commit would join.
 */
export class WalWriter {
    readonly #walDir: Directory;
    readonly #name: string;
    readonly #maxSegmentSize: number;
    readonly #fsync: boolean;
    readonly #onRotate?: () => void;
    readonly #mutex = new Mutex(this);

    #handle?: File.Handle;
    #nextSegment: number;
    #currentSegment = 0;
    #currentOffset = 0;
    #currentSize = 0;

    constructor(walDir: Directory, options: WalWriter.Options) {
        this.#walDir = walDir;
        this.#name = options.name ?? "unknown";
        this.#maxSegmentSize = options.maxSegmentSize ?? 16 * 1024 * 1024; // 16 MB default
        this.#fsync = options.fsync ?? true;
        this.#onRotate = options.onRotate;
        this.#nextSegment = options.firstSegment;
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
        return this.#mutex.produce(async () => {
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

            try {
                await this.#handle!.writeHandle(line);
                if (this.#fsync) {
                    await this.#handle!.fsync();
                }
            } catch (error) {
                await this.#closeHandle();
                throw error;
            }

            this.#currentOffset++;
            this.#currentSize += new TextEncoder().encode(line).length;

            return { id, ts };
        });
    }

    /**
     * Wait for pending writes, then close the current segment.  Throws if closing the segment fails.
     */
    async close(): Promise<void> {
        await this.#mutex.close();
        const handle = this.#handle;
        this.#handle = undefined;
        await handle?.close();
    }

    async #openSegment(): Promise<void> {
        await this.#walDir.mkdir();
        const segment = this.#nextSegment;
        const file = this.#walDir.file(segmentFilename(segment));
        this.#handle = await file.open(`WAL writer ${this.#name} segment ${segment}`, "a");
        this.#nextSegment = segment + 1;
        this.#currentSegment = segment;
        this.#currentOffset = 0;
        this.#currentSize = 0;
    }

    async #rotate(): Promise<void> {
        await this.#closeHandle();
        await this.#openSegment();
        this.#onRotate?.();
    }

    /**
     * Close the current segment so the next write starts a new one.  The writer continues either way, so a close
     * failure is only logged.
     */
    async #closeHandle(): Promise<void> {
        const handle = this.#handle;
        const segment = this.#currentSegment;
        this.#handle = undefined;
        await handle
            ?.close()
            .catch(error => logger.warn(`Closing WAL segment ${segment} of ${this.#name} failed:`, error));
    }
}

export namespace WalWriter {
    export interface Options {
        /** Storage name, used in file handle leak diagnostics. */
        name?: string;
        /** Maximum segment size in bytes before rotation. Default 16 MB. */
        maxSegmentSize?: number;
        /** Whether to fsync after each write. Default true. */
        fsync?: boolean;
        /** Called after a segment is rotated. */
        onRotate?: () => void;

        /**
         * Number of the first segment to write.  Must be higher than every existing segment and than the segment of
         * every commit the storage already knows of.
         */
        firstSegment: number;
    }
}
