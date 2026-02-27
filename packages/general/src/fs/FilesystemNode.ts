/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { MaybePromise } from "../util/Promises.js";

/**
 * Base class for filesystem entries (files and directories).
 */
export abstract class FilesystemNode {
    abstract readonly kind: "file" | "directory";
    abstract readonly name: string;

    /**
     * Back-reference to the root {@link Filesystem} that owns this node.
     */
    abstract readonly fs: import("./Filesystem.js").Filesystem;

    abstract exists(): Promise<boolean>;
    abstract stat(): MaybePromise<FilesystemNode.Stat>;
    abstract rename(name: string): Promise<void>;
    abstract delete(): Promise<void>;
}

export namespace FilesystemNode {
    export interface Stat {
        size: number;
        mtime: Date;
        type: "file" | "directory";
    }
}
