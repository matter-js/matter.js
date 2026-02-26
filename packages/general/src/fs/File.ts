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
         * Close the file handle.
         */
        abstract close(): Promise<void>;
    }
}

/**
 * Thrown when an operation is not valid for the entry type (e.g. reading bytes from a directory).
 */
export class FileTypeError extends FilesystemError {}
