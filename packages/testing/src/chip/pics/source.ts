/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import type { Container } from "../../docker/container.js";
import { PicsFile } from "./file.js";

const dataCache = new WeakMap<PicsSource, PicsFile>();
// Keyed per-container: the same PicsFile installed into two containers needs two filenames, one
// actually written into each.
const filenameCache = new WeakMap<Container, WeakMap<PicsFile, string>>();

let nextFileNo = 1;

/**
 * Source of PICS values.
 */
export type PicsSource =
    | PicsSource.Composite
    | PicsSource.ChipFile
    | PicsSource.LocalFile
    | PicsSource.Lines
    | PicsSource.Values;

export namespace PicsSource {
    /**
     * Load a {@link PicsFile} defined by a {@link PicsSource}.
     *
     * Caches results so a source always returns the same {@link PicsFile} instance. `container` is
     * only actually read for a `"chip"`-kind source; callers that know their sources never resolve to
     * one may omit it.
     */
    export async function load(source: PicsSource, container?: Container): Promise<PicsFile> {
        let file = dataCache.get(source);
        if (file) {
            return file;
        }

        switch (source.kind) {
            case "composite":
                for (const subsource of source.sources) {
                    const sourceFile = await load(subsource, container);
                    if (file) {
                        file.patch(sourceFile);
                    } else {
                        // patch() modifies its target, and every subsource's file is cached and shared,
                        // so a composite accumulates into a copy of its own.
                        file = new PicsFile([...sourceFile.lines]);
                    }
                }
                if (!file) {
                    file = new PicsFile();
                }
                break;

            case "chip":
                if (!container) {
                    throw new Error(`Loading PICS source "${source.name}" requires a container`);
                }
                file = new PicsFile(await container.read(source.name));
                break;

            case "file":
                file = new PicsFile(await readFile(await resolve(source.name), "utf-8"));
                break;

            case "lines":
                file = new PicsFile(source.lines.split("\n").map(l => l.trim()));
                break;

            case "values":
                file = new PicsFile(Object.entries(source.values).map(([key, value]) => `${key}=${value}`));
                break;

            default:
                throw new Error(`Invalid PICS source kind "${(source as { kind: unknown }).kind}"`);
        }

        dataCache.set(source, file);

        return file;
    }

    /**
     * Save a {@link PicsFile} to the a {@link ChipFile} or {@link LocalFile}.
     */
    export async function save(container: Container, target: ChipFile | LocalFile, file: PicsFile): Promise<void> {
        switch (target.kind) {
            case "chip":
                await container.write(target.name, file.toString());
                break;

            case "file":
                await container.write(await resolve(target.name), file.toString());
                break;

            default:
                throw new Error(`Invalid PICS target kind "${(target as { kind: unknown }).kind}"`);
        }
    }

    /**
     * Install a {@link PicsSource} into `container`.
     *
     * Returns the name of the file in the container.
     *
     * Results are cached so the same source always returns the same filename.
     */
    export async function install(container: Container, file: PicsFile): Promise<string> {
        let byFile = filenameCache.get(container);
        if (!byFile) {
            byFile = new WeakMap<PicsFile, string>();
            filenameCache.set(container, byFile);
        }

        let filename = byFile.get(file);
        if (filename) {
            return filename;
        }

        filename = `/pics-${nextFileNo++}.properties`;

        try {
            byFile.set(file, filename);
            await save(container, { kind: "chip", name: filename }, file);
        } catch (e) {
            byFile.delete(file);
            throw e;
        }

        return filename;
    }

    export interface Composite {
        kind: "composite";
        sources: Source[];
    }

    export interface ChipFile {
        kind: "chip";
        name: string;
    }

    export interface LocalFile {
        kind: "file";
        name: string;
    }

    export interface Lines {
        kind: "lines";
        lines: string;
    }

    export interface Values {
        kind: "values";
        values: Record<string, 0 | 1>;
    }

    export type Source = ChipFile | LocalFile | Lines | Values;
}

// A "file"-kind PICS source is a rare, local-dev-only path (unused by any test in this suite).
// @nacho-iot/js-tools pulls in Node build tooling that isn't browser-bundleable; importing it lazily,
// only when this branch actually runs, keeps every other PicsSource kind (and everything that only
// ever installs/loads those) free of that dependency. The specifier is built at runtime, not written
// as a literal, so esbuild's Web test bundle can't trace and inline it (a literal `import("@nacho-iot/js-tools")`
// would drag its build-tooling submodules into that bundle even though this branch never runs there).
async function resolve(path: string): Promise<string> {
    if (isAbsolute(path)) {
        return path;
    }

    const jsToolsSpecifier = ["@nacho-iot", "js-tools"].join("/");
    const { Package }: typeof import("@nacho-iot/js-tools") = await import(jsToolsSpecifier);
    const testing = Package.findPackage("@matter/testing");
    if (testing.hasFile(path)) {
        return testing.resolve(path);
    }

    throw new Error(`PICS file "${path}" not found relative to @matter/testing`);
}
