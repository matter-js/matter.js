/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { File } from "./File.js";
import { FilesystemNode } from "./FilesystemNode.js";

/**
 * Abstract handle to a directory.
 *
 * A Directory is a handle -- the underlying entry need not exist yet.
 */
export abstract class Directory extends FilesystemNode {
    readonly kind = "directory";

    /**
     * Return the native filesystem path for this directory, if available.  Throws by default; platform-specific
     * subclasses (e.g. NodeJsDirectory) override this.
     */
    get path(): string {
        throw new Error("This directory does not expose a native path");
    }

    abstract entries(): AsyncIterable<Directory.Entry>;
    abstract file(name: string): File;
    abstract directory(name: string): Directory;
    abstract mkdir(): Promise<void>;

    /**
     * Open an existing entry at a relative path.  Returns a {@link File} or {@link Directory} based on what exists,
     * or throws {@link FileNotFoundError} if the path does not exist.
     */
    async open(path: string): Promise<Directory.Entry> {
        const segments = path.split(/[/\\]/).filter(s => s !== "");
        if (segments.length === 0) {
            return this;
        }

        let current: Directory = this;
        for (let i = 0; i < segments.length - 1; i++) {
            current = current.directory(segments[i]);
        }

        const lastName = segments[segments.length - 1];
        const handle = current.file(lastName);
        const s = await handle.stat();
        if (s.type === "directory") {
            return current.directory(lastName);
        }
        return handle;
    }

    /**
     * Get a {@link File} handle at a relative path.  The file need not exist yet.
     */
    create(path: string): File {
        const segments = path.split(/[/\\]/).filter(s => s !== "");

        let current: Directory = this;
        for (let i = 0; i < segments.length - 1; i++) {
            current = current.directory(segments[i]);
        }
        return current.file(segments[segments.length - 1]);
    }

    /**
     * List file names in this directory.
     */
    async files(): Promise<string[]> {
        const result = Array<string>();
        for await (const entry of this.entries()) {
            if (entry.kind === "file") {
                result.push(entry.name);
            }
        }
        return result;
    }

    /**
     * List subdirectory names in this directory.
     */
    async directories(): Promise<string[]> {
        const result = Array<string>();
        for await (const entry of this.entries()) {
            if (entry.kind === "directory") {
                result.push(entry.name);
            }
        }
        return result;
    }
}

export namespace Directory {
    export type Entry = File | Directory;
}
