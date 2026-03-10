/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Bytes } from "../util/Bytes.js";
import type { MaybeAsyncIterable } from "../util/Streams.js";
import { FilesystemError } from "./FilesystemError.js";
import { FilesystemNode } from "./FilesystemNode.js";

/**
 * Abstract handle to a file.
 *
 * A File is a handle -- the underlying entry need not exist yet.
 */
export abstract class File extends FilesystemNode {
    readonly kind = "file";

    abstract readBytes(): AsyncIterable<Uint8Array>;
    abstract readText(options?: File.ReadTextOptions): AsyncIterable<string>;
    abstract write(data: Bytes | string | MaybeAsyncIterable<Bytes> | MaybeAsyncIterable<string>): Promise<void>;

    /**
     * Open the file and return a handle for low-level operations (append, fsync).
     */
    abstract open(mode?: File.OpenMode): Promise<File.Handle>;

    /**
     * Read all bytes from the file into a single buffer.
     */
    async readAllBytes(): Promise<Uint8Array> {
        const chunks = Array<Uint8Array>();
        let totalLength = 0;
        for await (const chunk of this.readBytes()) {
            chunks.push(chunk);
            totalLength += chunk.length;
        }
        if (chunks.length === 1) {
            return chunks[0];
        }
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    }

    /**
     * Read the entire file as a string.
     */
    async readAllText(): Promise<string> {
        const chunks = Array<string>();
        for await (const chunk of this.readText()) {
            chunks.push(chunk);
        }
        return chunks.join("");
    }
}

export namespace File {
    export type OpenMode = "r" | "w" | "a";

    export interface ReadTextOptions {
        /** When true, yields individual lines with newlines stripped. */
        lines?: boolean;
    }

    /**
     * An opened file handle supporting append writes and fsync.
     */
    export abstract class Handle extends File {
        /**
         * Write data to the open file handle (appends at current position).
         */
        abstract writeHandle(data: Bytes | string): Promise<void>;

        /**
         * Flush file data to persistent storage.
         */
        abstract fsync(): Promise<void>;

        /**
         * Create a cursor for sequential or random-access reading with an internal buffer.
         *
         * The cursor starts at position 0.  {@link max} sets the upper byte bound (typically file size); reads will
         * not exceed it.  The optional {@link bufferSize} controls the internal buffer size used for shared reads
         * (default 8192).
         */
        abstract cursor(max: number, bufferSize?: number): Cursor;

        /**
         * Truncate the file to the specified size (default 0).
         */
        abstract truncate(size?: number): Promise<void>;

        /**
         * Close the file handle.
         */
        abstract close(): Promise<void>;
    }

    /**
     * A cursor for reading from an open file handle with an internal reusable buffer.
     *
     * The cursor maintains a current position that advances automatically after each {@link read}.  Use {@link seek}
     * to reposition for random access.
     *
     * The {@link read} method's `copy` parameter controls buffer allocation:
     * - `copy = false` (default): returns a view into the cursor's internal buffer.  The view is invalidated on the
     *    next read, so callers must consume the data before reading again.
     * - `copy = true`: allocates a fresh buffer and reads directly into it, returning owned data safe to retain.
     */
    export abstract class Cursor {
        #position = 0;
        readonly #max: number;

        constructor(max: number) {
            this.#max = max;
        }

        /**
         * The upper byte bound for this cursor (typically file size).
         */
        get max() {
            return this.#max;
        }

        /**
         * The current byte position in the file.
         */
        get position() {
            return this.#position;
        }

        /**
         * Move the cursor to a byte position.
         */
        seek(position: number) {
            this.#position = position;
        }

        /**
         * Read up to {@link length} bytes from the current position.
         *
         * Returns fewer bytes than requested at EOF.  Advances the position by the number of bytes read.
         *
         * @param copy when true, returns a new owned buffer; when false (default), returns a view of the internal
         *   buffer that is invalidated on the next read
         */
        async read(length: number, copy?: boolean): Promise<Uint8Array> {
            const result = await this.readAt(this.#position, length, copy);
            this.#position += result.length;
            return result;
        }

        /**
         * Read up to {@link length} bytes at the given position without moving the cursor.
         */
        protected abstract readAt(position: number, length: number, copy?: boolean): Promise<Uint8Array>;
    }
}

/**
 * Thrown when an operation is not valid for the entry type (e.g. reading bytes from a directory).
 */
export class FileTypeError extends FilesystemError {}
