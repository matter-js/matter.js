/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Diagnostic, Logger } from "#general";
import { Specification } from "#model";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SpecReference } from "../spec-types.js";
import { parseFrontmatter } from "./md-utils.js";

export const DEFAULT_MATTER_VERSION = Specification.REVISION;

export type IndexDetail = {
    ref: SpecReference;
    version: string;
    hasClusters: boolean;
    hasDevices: boolean;
    hasNamespaces: boolean;
};

const logger = Logger.get("load-markdown");

/**
 * Mapping from spec subdirectory names to {@link Specification} values.
 */
const SUBDIR_TO_SPEC: Record<string, `${Specification}`> = {
    main: Specification.Core,
    appclusters: Specification.Cluster,
    device_library: Specification.Device,
    standard_namespaces: Specification.Namespace,
};

/**
 * A discovered and loaded markdown specification document.
 */
export interface MarkdownDocument {
    indexPath: string;
    content: string;
    spec: string;
    version: string;
}

/**
 * Check whether a given path looks like a markdown spec directory.
 *
 * Returns true if the path is a directory containing at least one known spec subdirectory with an `_index.md` file.
 */
export function isMarkdownSpecPath(path: string): boolean {
    try {
        if (!lstatSync(path).isDirectory()) {
            return false;
        }
    } catch {
        return false;
    }

    for (const subdir of Object.keys(SUBDIR_TO_SPEC)) {
        if (existsSync(join(path, subdir, "_index.md"))) {
            return true;
        }
    }

    return false;
}

/**
 * Discover markdown spec documents in a base directory and yield them as {@link MarkdownDocument} objects.
 *
 * Each known subdirectory is identified via its `_index.md` frontmatter, then all chapter files listed in the index
 * are concatenated into a single content string with frontmatter stripped.
 */
export function* discoverMarkdownFiles(basePath: string, documentFilter?: string): Generator<MarkdownDocument> {
    for (const [subdir, expectedSpec] of Object.entries(SUBDIR_TO_SPEC)) {
        const indexPath = join(basePath, subdir, "_index.md");

        if (!existsSync(indexPath)) {
            continue;
        }

        // Apply document filter early
        if (documentFilter !== undefined && expectedSpec !== documentFilter) {
            continue;
        }

        let document: MarkdownDocument;
        try {
            document = loadMarkdownDocument(basePath, subdir, indexPath);
        } catch (e) {
            logger.info(`skipping ${subdir}: ${(e as Error).message}`);
            continue;
        }

        logger.info("recognized", Diagnostic.dict({ doc: document.spec, version: document.version }));

        yield document;
    }
}

/**
 * Identify a markdown document from its `_index.md` frontmatter and produce an {@link IndexDetail}.
 */
export function identifyMarkdownDocument(indexPath: string): IndexDetail {
    const raw = readFileSync(indexPath, "utf-8");
    const { frontmatter } = parseFrontmatter(raw);

    const spec = frontmatter.spec as `${Specification}`;

    let hasClusters = false;
    let hasDevices = false;
    let hasNamespaces = false;

    switch (spec) {
        case Specification.Core:
        case Specification.Cluster:
            hasClusters = true;
            break;

        case Specification.Device:
            hasDevices = true;
            break;

        case Specification.Namespace:
            hasNamespaces = true;
            break;
    }

    return {
        ref: {
            name: frontmatter.title,
            path: indexPath,
            xref: {
                document: spec as Specification,
                section: "",
            },
        },
        version: frontmatter.version,
        hasClusters,
        hasDevices,
        hasNamespaces,
    };
}

/**
 * Load a single markdown document: parse `_index.md` for metadata and chapter order, then concatenate chapter bodies.
 */
function loadMarkdownDocument(basePath: string, subdir: string, indexPath: string): MarkdownDocument {
    const raw = readFileSync(indexPath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(raw);

    const chapterFiles = parseChapterList(body);
    const docDir = join(basePath, subdir);
    const parts: string[] = [];

    for (const filename of chapterFiles) {
        const chapterPath = join(docDir, filename);

        if (!existsSync(chapterPath)) {
            logger.warn(`chapter file not found: ${chapterPath}`);
            continue;
        }

        const chapterRaw = readFileSync(chapterPath, "utf-8");

        try {
            const { body: chapterBody } = parseFrontmatter(chapterRaw);
            parts.push(chapterBody);
        } catch {
            // File without frontmatter — include as-is
            parts.push(chapterRaw);
        }
    }

    return {
        indexPath,
        content: parts.join("\n"),
        spec: frontmatter.spec,
        version: frontmatter.version,
    };
}

/**
 * Extract the ordered list of chapter filenames from the `_index.md` body.
 *
 * Looks for markdown links in list items: `- [title](filename.md)`
 */
function parseChapterList(body: string): string[] {
    const files: string[] = [];

    for (const line of body.split("\n")) {
        const match = line.match(/^\s*-\s+\[.*?\]\(([^)]+\.md)\)/);
        if (match) {
            files.push(match[1]);
        }
    }

    return files;
}
