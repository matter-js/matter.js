/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Package } from "#tools";
import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { State } from "../state.js";
import { PicsFile } from "./file.js";

const dataCache = new WeakMap<PicsSource, PicsFile>();
const filenameCache = new WeakMap<PicsFile, string>();

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
     * Caches results so a source always returns the same {@link PicsFile} instance.
     */
    export async function load(source: PicsSource): Promise<PicsFile> {
        let file = dataCache.get(source);
        if (file) {
            return file;
        }

        switch (source.kind) {
            case "composite":
                for (const subsource of source.sources) {
                    const sourceFile = await load(subsource);
                    if (file) {
                        file.patch(sourceFile);
                    } else {
                        file = sourceFile;
                    }
                }
                if (!file) {
                    file = new PicsFile();
                }
                break;

            case "chip":
                file = new PicsFile(await State.container.read(source.name));
                break;

            case "file":
                file = new PicsFile(await readFile(resolve(source.name), "utf-8"));
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
    export async function save(target: ChipFile | LocalFile, file: PicsFile): Promise<void> {
        switch (target.kind) {
            case "chip":
                await State.container.write(target.name, file.toString());
                break;

            case "file":
                await State.container.write(resolve(target.name), file.toString());
                break;

            default:
                throw new Error(`Invalid PICS target kind "${(target as { kind: unknown }).kind}"`);
        }
    }

    /**
     * Install a {@link PicsSource} into the test container.
     *
     * Returns the name of the file in the container.
     *
     * Results are cached so the same source always returns the same filename.
     */
    export async function install(file: PicsFile): Promise<string> {
        let filename = filenameCache.get(file);
        if (filename) {
            return filename;
        }

        filename = `/pics-${nextFileNo++}.properties`;

        try {
            filenameCache.set(file, filename);
            await save({ kind: "chip", name: filename }, file);
        } catch (e) {
            filenameCache.delete(file);
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

function resolve(path: string): string {
    if (isAbsolute(path)) {
        return path;
    }

    const testing = Package.tools.findPackage("@matter/testing");
    if (testing.hasFile(path)) {
        return testing.resolve(path);
    }

    return resolve(path);
}
