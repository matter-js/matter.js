/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Bytes } from "../util/Bytes.js";
import type { MaybePromise } from "../util/Promises.js";
import type { MaybeAsyncIterable } from "../util/Streams.js";
import { Directory } from "./Directory.js";
import { File, FileTypeError } from "./File.js";
import { Filesystem } from "./Filesystem.js";
import { FileNotFoundError } from "./FilesystemError.js";
import type { FilesystemNode } from "./FilesystemNode.js";

interface MockNode {
    type: "file" | "directory";
    mtime: Date;
    content?: Uint8Array;
    children?: Map<string, MockNode>;
}

function createDirNode(): MockNode {
    return { type: "directory", mtime: new Date(), children: new Map() };
}

function createFileNode(content: Uint8Array): MockNode {
    return { type: "file", mtime: new Date(), content };
}

/**
 * In-memory filesystem for testing.
 */
export class MockFilesystem extends Filesystem {
    readonly #root: MockNode;
    #tempCounter = 0;

    constructor() {
        super();
        this.#root = createDirNode();
    }

    get name() {
        return "";
    }

    exists(): Promise<boolean> {
        return Promise.resolve(true);
    }

    stat(): FilesystemNode.Stat {
        return {
            size: 0,
            mtime: this.#root.mtime,
            type: "directory" as const,
        };
    }

    rename(): Promise<void> {
        throw new FileTypeError("Cannot rename root");
    }

    async delete(): Promise<void> {
        this.#root.children?.clear();
    }

    async *entries(): AsyncIterable<Directory.Entry> {
        if (!this.#root.children) {
            return;
        }
        for (const [name, child] of this.#root.children) {
            if (child.type === "directory") {
                yield new MockDirectory(this, [name], this.#root, statOf(child));
            } else {
                yield new MockFile(this, [name], this.#root, statOf(child));
            }
        }
    }

    file(name: string): File {
        return new MockFile(this, [name], this.#root);
    }

    directory(name: string): Directory {
        return new MockDirectory(this, [name], this.#root);
    }

    async mkdir(): Promise<void> {
        // Root always exists
    }

    async copy(source: string | FilesystemNode, target: string | FilesystemNode): Promise<void> {
        mockCopy(this.#root, source, target);
    }

    tempFilename(): string {
        return `tmp-${Date.now()}-${this.#tempCounter++}`;
    }

    tempDirectory(): Directory {
        return this.directory(this.tempFilename());
    }
}

function statOf(node: MockNode): FilesystemNode.Stat {
    return {
        size: node.type === "file" ? (node.content?.length ?? 0) : 0,
        mtime: node.mtime,
        type: node.type,
    };
}

function resolvePath(segments: string[], root: MockNode): MockNode | undefined {
    let current = root;
    for (const segment of segments) {
        if (current.type !== "directory" || !current.children) {
            return undefined;
        }
        const child = current.children.get(segment);
        if (!child) {
            return undefined;
        }
        current = child;
    }
    return current;
}

function mkdirp(segments: string[], root: MockNode): MockNode {
    let current = root;
    for (const segment of segments) {
        if (!current.children) {
            current.children = new Map();
        }
        let child = current.children.get(segment);
        if (!child) {
            child = createDirNode();
            current.children.set(segment, child);
        }
        if (child.type !== "directory") {
            throw new FileTypeError(`"${segment}" is not a directory`);
        }
        current = child;
    }
    return current;
}

function isBytes(value: unknown): value is Bytes {
    return Bytes.isBytes(value);
}

async function textToBytes(data: string | MaybeAsyncIterable<string>): Promise<Uint8Array> {
    let text: string;
    if (typeof data === "string") {
        text = data;
    } else {
        const lines = Array<string>();
        for await (const line of data) {
            lines.push(line);
        }
        text = lines.join("\n");
    }
    return new TextEncoder().encode(text);
}

class MockFile extends File {
    readonly #fs: Filesystem;
    readonly #segments: string[];
    readonly #root: MockNode;
    readonly #cachedStat?: FilesystemNode.Stat;

    constructor(fs: Filesystem, segments: string[], root: MockNode, cachedStat?: FilesystemNode.Stat) {
        super();
        this.#fs = fs;
        this.#segments = segments;
        this.#root = root;
        this.#cachedStat = cachedStat;
        mockSegmentsMap.set(this, segments);
    }

    override get fs() {
        return this.#fs;
    }

    async open(mode?: File.OpenMode): Promise<File.Handle> {
        const m = mode ?? "r";
        if (m === "w" || m === "a") {
            // Ensure parent directories exist
            mkdirp(this.#segments.slice(0, -1), this.#root);
            const parent = resolvePath(this.#segments.slice(0, -1), this.#root)!;
            let node = resolvePath(this.#segments, this.#root);
            if (!node) {
                node = createFileNode(new Uint8Array(0));
                parent.children!.set(this.name, node);
            }
            if (m === "w") {
                node.content = new Uint8Array(0);
            }
        } else {
            const node = resolvePath(this.#segments, this.#root);
            if (!node) {
                throw new FileNotFoundError(`File not found: ${this.#segments.join("/")}`);
            }
        }
        return new MockFileHandle(this.#fs, this.#segments, this.#root);
    }

    get name() {
        return this.#segments[this.#segments.length - 1];
    }

    async exists(): Promise<boolean> {
        return resolvePath(this.#segments, this.#root) !== undefined;
    }

    stat(): MaybePromise<FilesystemNode.Stat> {
        if (this.#cachedStat) {
            return this.#cachedStat;
        }
        const node = resolvePath(this.#segments, this.#root);
        if (!node) {
            throw new FileNotFoundError(`File not found: ${this.#segments.join("/")}`);
        }
        return statOf(node);
    }

    async *readBytes(): AsyncIterable<Uint8Array> {
        const node = resolvePath(this.#segments, this.#root);
        if (!node) {
            throw new FileNotFoundError(`File not found: ${this.#segments.join("/")}`);
        }
        if (node.type === "directory") {
            throw new FileTypeError("Cannot read bytes from a directory");
        }
        if (node.content && node.content.length > 0) {
            yield node.content;
        }
    }

    async *readText(options?: File.ReadTextOptions): AsyncIterable<string> {
        const node = resolvePath(this.#segments, this.#root);
        if (!node) {
            throw new FileNotFoundError(`File not found: ${this.#segments.join("/")}`);
        }
        if (node.type === "directory") {
            throw new FileTypeError("Cannot read text from a directory");
        }
        const text = new TextDecoder().decode(node.content ?? new Uint8Array());
        if (options?.lines) {
            for (const line of text.split("\n")) {
                yield line;
            }
        } else {
            yield text;
        }
    }

    async write(data: Bytes | string | MaybeAsyncIterable<Bytes> | MaybeAsyncIterable<string>): Promise<void> {
        let content: Uint8Array;
        if (typeof data === "string") {
            content = await textToBytes(data);
        } else if (isBytes(data)) {
            content = Bytes.of(data);
        } else {
            // Peek at the iterable to determine type
            const iter = Symbol.asyncIterator in data ? data[Symbol.asyncIterator]() : data[Symbol.iterator]();
            const first = await iter.next();
            if (first.done) {
                content = new Uint8Array(0);
            } else if (typeof first.value === "string") {
                // String iterable — collect remaining and join as lines
                const lines = [first.value as string];
                while (true) {
                    const next = await iter.next();
                    if (next.done) break;
                    lines.push(next.value as string);
                }
                content = new TextEncoder().encode(lines.join("\n"));
            } else {
                // Bytes iterable — collect remaining chunks
                const firstBytes = Bytes.of(first.value as Bytes);
                const chunks = [firstBytes];
                let totalLength = firstBytes.length;
                while (true) {
                    const next = await iter.next();
                    if (next.done) break;
                    const bytes = Bytes.of(next.value as Bytes);
                    chunks.push(bytes);
                    totalLength += bytes.length;
                }
                if (chunks.length === 1) {
                    content = chunks[0];
                } else {
                    content = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const chunk of chunks) {
                        content.set(chunk, offset);
                        offset += chunk.length;
                    }
                }
            }
        }

        const parentNode = mkdirp(this.#segments.slice(0, -1), this.#root);
        const existing = parentNode.children?.get(this.name);
        if (existing && existing.type === "directory") {
            throw new FileTypeError(`"${this.name}" is a directory`);
        }
        parentNode.children!.set(this.name, createFileNode(content));
    }

    async rename(newName: string): Promise<void> {
        const parent = resolvePath(this.#segments.slice(0, -1), this.#root);
        if (!parent?.children) {
            throw new FileNotFoundError(`File not found: ${this.#segments.join("/")}`);
        }
        const node = parent.children.get(this.name);
        if (!node) {
            throw new FileNotFoundError(`File not found: ${this.#segments.join("/")}`);
        }
        parent.children.delete(this.name);
        parent.children.set(newName, node);
        this.#segments[this.#segments.length - 1] = newName;
    }

    async delete(): Promise<void> {
        const parent = resolvePath(this.#segments.slice(0, -1), this.#root);
        if (parent?.children) {
            parent.children.delete(this.name);
        }
    }
}

class MockDirectory extends Directory {
    readonly #fs: Filesystem;
    readonly #segments: string[];
    readonly #root: MockNode;
    readonly #cachedStat?: FilesystemNode.Stat;

    constructor(fs: Filesystem, segments: string[], root: MockNode, cachedStat?: FilesystemNode.Stat) {
        super();
        this.#fs = fs;
        this.#segments = segments;
        this.#root = root;
        this.#cachedStat = cachedStat;
        mockSegmentsMap.set(this, segments);
    }

    override get fs() {
        return this.#fs;
    }

    get name() {
        return this.#segments[this.#segments.length - 1];
    }

    async exists(): Promise<boolean> {
        const node = resolvePath(this.#segments, this.#root);
        return node !== undefined && node.type === "directory";
    }

    stat(): MaybePromise<FilesystemNode.Stat> {
        if (this.#cachedStat) {
            return this.#cachedStat;
        }
        const node = resolvePath(this.#segments, this.#root);
        if (!node) {
            throw new FileNotFoundError(`Directory not found: ${this.#segments.join("/")}`);
        }
        return statOf(node);
    }

    rename(newName: string): Promise<void> {
        const parent = resolvePath(this.#segments.slice(0, -1), this.#root);
        if (!parent?.children) {
            return Promise.reject(new FileNotFoundError(`Directory not found: ${this.#segments.join("/")}`));
        }
        const node = parent.children.get(this.name);
        if (!node) {
            return Promise.reject(new FileNotFoundError(`Directory not found: ${this.#segments.join("/")}`));
        }
        parent.children.delete(this.name);
        parent.children.set(newName, node);
        this.#segments[this.#segments.length - 1] = newName;
        return Promise.resolve();
    }

    async delete(): Promise<void> {
        const parent = resolvePath(this.#segments.slice(0, -1), this.#root);
        if (parent?.children) {
            parent.children.delete(this.name);
        }
    }

    async *entries(): AsyncIterable<Directory.Entry> {
        const node = resolvePath(this.#segments, this.#root);
        if (!node || node.type !== "directory") {
            throw new FileNotFoundError(`Directory not found: ${this.#segments.join("/")}`);
        }
        if (!node.children) {
            return;
        }
        for (const [name, child] of node.children) {
            if (child.type === "directory") {
                yield new MockDirectory(this.#fs, [...this.#segments, name], this.#root, statOf(child));
            } else {
                yield new MockFile(this.#fs, [...this.#segments, name], this.#root, statOf(child));
            }
        }
    }

    file(name: string): File {
        return new MockFile(this.#fs, [...this.#segments, name], this.#root);
    }

    directory(name: string): Directory {
        return new MockDirectory(this.#fs, [...this.#segments, name], this.#root);
    }

    async mkdir(): Promise<void> {
        mkdirp(this.#segments, this.#root);
    }

    async copy(source: string | FilesystemNode, target: string | FilesystemNode): Promise<void> {
        mockCopy(this.#root, source, target);
    }
}

const mockSegmentsMap = new WeakMap<FilesystemNode, string[]>();

function deepCloneNode(node: MockNode): MockNode {
    if (node.type === "file") {
        return {
            type: "file",
            mtime: new Date(node.mtime.getTime()),
            content: node.content ? new Uint8Array(node.content) : undefined,
        };
    }
    const children = new Map<string, MockNode>();
    if (node.children) {
        for (const [name, child] of node.children) {
            children.set(name, deepCloneNode(child));
        }
    }
    return { type: "directory", mtime: new Date(node.mtime.getTime()), children };
}

function resolveArg(arg: string | FilesystemNode): string[] {
    if (typeof arg === "string") {
        return arg.split("/").filter(s => s !== "");
    }
    const segments = mockSegmentsMap.get(arg);
    if (segments) {
        return segments;
    }
    // Root filesystem has empty segments
    if (arg.name === "") {
        return [];
    }
    throw new FileTypeError("Cannot resolve non-mock filesystem node in MockFilesystem.copy()");
}

function mockCopy(root: MockNode, source: string | FilesystemNode, target: string | FilesystemNode) {
    const sourceSegments = resolveArg(source);
    const targetSegments = resolveArg(target);

    let sourceNode: MockNode | undefined;
    if (sourceSegments.length === 0) {
        sourceNode = root;
    } else {
        sourceNode = resolvePath(sourceSegments, root);
    }
    if (!sourceNode) {
        throw new FileNotFoundError(`Source not found: ${sourceSegments.join("/")}`);
    }

    const cloned = deepCloneNode(sourceNode);

    if (targetSegments.length === 0) {
        // Copying to root — merge children
        if (cloned.children) {
            if (!root.children) {
                root.children = new Map();
            }
            for (const [name, child] of cloned.children) {
                root.children.set(name, child);
            }
        }
        return;
    }

    const parentSegments = targetSegments.slice(0, -1);
    const parent = parentSegments.length > 0 ? mkdirp(parentSegments, root) : root;
    const targetName = targetSegments[targetSegments.length - 1];
    if (!parent.children) {
        parent.children = new Map();
    }
    parent.children.set(targetName, cloned);
}

class MockFileHandle extends File.Handle {
    readonly #fs: Filesystem;
    readonly #segments: string[];
    readonly #root: MockNode;
    #closed = false;

    constructor(fs: Filesystem, segments: string[], root: MockNode) {
        super();
        this.#fs = fs;
        this.#segments = segments;
        this.#root = root;
        mockSegmentsMap.set(this, segments);
    }

    override get fs() {
        return this.#fs;
    }

    get name() {
        return this.#segments[this.#segments.length - 1];
    }

    async exists(): Promise<boolean> {
        return resolvePath(this.#segments, this.#root) !== undefined;
    }

    stat(): MaybePromise<FilesystemNode.Stat> {
        const node = resolvePath(this.#segments, this.#root);
        if (!node) {
            throw new FileNotFoundError(`File not found: ${this.#segments.join("/")}`);
        }
        return statOf(node);
    }

    async *readBytes(): AsyncIterable<Uint8Array> {
        const node = resolvePath(this.#segments, this.#root);
        if (!node) {
            throw new FileNotFoundError(`File not found: ${this.#segments.join("/")}`);
        }
        if (node.content && node.content.length > 0) {
            yield node.content;
        }
    }

    async *readText(options?: File.ReadTextOptions): AsyncIterable<string> {
        const node = resolvePath(this.#segments, this.#root);
        if (!node) {
            throw new FileNotFoundError(`File not found: ${this.#segments.join("/")}`);
        }
        const text = new TextDecoder().decode(node.content ?? new Uint8Array());
        if (options?.lines) {
            for (const line of text.split("\n")) {
                yield line;
            }
        } else {
            yield text;
        }
    }

    async write(data: Bytes | string | MaybeAsyncIterable<Bytes> | MaybeAsyncIterable<string>): Promise<void> {
        // Delegate full write to a MockFile
        const file = new MockFile(this.#fs, this.#segments, this.#root);
        return file.write(data);
    }

    async open(): Promise<File.Handle> {
        return this;
    }

    async writeHandle(data: Bytes | string): Promise<void> {
        if (this.#closed) {
            throw new FileTypeError("File handle is closed");
        }
        const node = resolvePath(this.#segments, this.#root);
        if (!node) {
            throw new FileNotFoundError(`File not found: ${this.#segments.join("/")}`);
        }
        const newBytes =
            typeof data === "string"
                ? new TextEncoder().encode(data)
                : data instanceof Uint8Array
                  ? data
                  : Bytes.of(data);
        const existing = node.content ?? new Uint8Array(0);
        const combined = new Uint8Array(existing.length + newBytes.length);
        combined.set(existing);
        combined.set(newBytes, existing.length);
        node.content = combined;
        node.mtime = new Date();
    }

    async fsync(): Promise<void> {
        if (this.#closed) {
            throw new FileTypeError("File handle is closed");
        }
        // No-op for mock
    }

    async close(): Promise<void> {
        this.#closed = true;
    }

    async rename(newName: string): Promise<void> {
        const parent = resolvePath(this.#segments.slice(0, -1), this.#root);
        if (!parent?.children) {
            throw new FileNotFoundError(`File not found: ${this.#segments.join("/")}`);
        }
        const node = parent.children.get(this.name);
        if (!node) {
            throw new FileNotFoundError(`File not found: ${this.#segments.join("/")}`);
        }
        parent.children.delete(this.name);
        parent.children.set(newName, node);
        this.#segments[this.#segments.length - 1] = newName;
    }

    async delete(): Promise<void> {
        const parent = resolvePath(this.#segments.slice(0, -1), this.#root);
        if (parent?.children) {
            parent.children.delete(this.name);
        }
        this.#closed = true;
    }
}
