/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Specification } from "#model";
import { JSDOM } from "jsdom";

/**
 * Parsed YAML frontmatter from a markdown spec file.
 */
export interface MarkdownFrontmatter {
    title: string;
    spec: string;
    version: string;
    date?: string;
    section_range?: string;
}

const SPEC_MAP: Record<string, `${Specification}`> = {
    main: Specification.Core,
    appclusters: Specification.Cluster,
    device_library: Specification.Device,
    standard_namespaces: Specification.Namespace,
};

// Shared lightweight DOM for element creation
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");

/**
 * Parse YAML frontmatter delimited by `---` lines.  Returns the parsed frontmatter and the remaining body text.
 */
export function parseFrontmatter(content: string): { frontmatter: MarkdownFrontmatter; body: string } {
    const lines = content.split("\n");

    if (lines[0]?.trim() !== "---") {
        throw new Error("Markdown file does not start with frontmatter delimiter");
    }

    const endIndex = lines.indexOf("---", 1);
    if (endIndex === -1) {
        throw new Error("Unterminated frontmatter block");
    }

    const yamlLines = lines.slice(1, endIndex);
    const fields: Record<string, string> = {};

    for (const line of yamlLines) {
        const match = line.match(/^(\w+)\s*:\s*"?([^"]*)"?\s*$/);
        if (match) {
            fields[match[1]] = match[2];
        }
    }

    const spec = SPEC_MAP[fields.spec];
    if (spec === undefined) {
        throw new Error(`Unknown spec identifier "${fields.spec}"`);
    }

    // Clean version: extract leading X.Y.Z, drop trailing .0
    let version = fields.version ?? "";
    const versionMatch = version.match(/^(\d+(?:\.\d+)*)/);
    if (versionMatch) {
        version = versionMatch[1];
    }
    const versionParts = version.split(".");
    if (versionParts.length > 2 && versionParts[2] === "0") {
        version = versionParts.slice(0, 2).join(".");
    } else if (versionParts.length > 3) {
        version = versionParts.slice(0, 3).join(".");
    }

    const body = lines.slice(endIndex + 1).join("\n");

    return {
        frontmatter: {
            title: fields.title ?? "",
            spec,
            version,
            date: fields.date,
            section_range: fields.section_range,
        },
        body,
    };
}

/**
 * Strip lightweight markdown formatting from text, producing plain text content that the HTML translators expect.
 *
 * - `[text](url)` links become just `text`
 * - `**bold**` markers are removed
 * - `` `code` `` backticks are removed
 * - `^` characters are preserved (exponent operator in constraint cells)
 */
function stripMarkdown(text: string): string {
    return (
        text
            // HTML anchor tags: <a id="..."></a> or <a id="...">text</a>
            .replace(/<a\s+[^>]*>\s*<\/a>/gi, "")
            .replace(/<a\s+[^>]*>([^<]*)<\/a>/gi, "$1")
            // Markdown links: [text](url)
            .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
            // Bold markers: **text** and __text__
            .replace(/\*\*([^*]*)\*\*/g, "$1")
            .replace(/__([^_]*)__/g, "$1")
            // Italic markers: *text* and _text_
            .replace(/\*([^*]+)\*/g, "$1")
            .replace(/(?<!\w)_([^_]+)_(?!\w)/g, "$1")
            // Inline code backticks
            .replace(/`([^`]*)`/g, "$1")
            // HTML superscripts: <sup>N</sup> → ^N
            .replace(/<sup>([^<]*)<\/sup>/gi, "^$1")
            // HTML subscripts: <sub>N</sub> → just N
            .replace(/<sub>([^<]*)<\/sub>/gi, "$1")
    );
}

/**
 * Create an HTMLElement whose `.textContent` matches what the HTML translators expect for table cell content.
 */
export function textToElement(text: string): HTMLElement {
    const el = dom.window.document.createElement("span");
    el.textContent = stripMarkdown(text);
    return el;
}

/**
 * Create a `<p>` element for prose paragraphs, matching what `addDocumentation` expects from the HTML scanner.
 * List markers are preserved in text content.
 */
export function proseToElement(text: string, admonition?: "NOTE" | "WARNING"): HTMLElement {
    const el = dom.window.document.createElement("p");
    el.textContent = stripMarkdown(text);
    if (admonition) {
        el.setAttribute("data-admonition", admonition);
    }
    return el;
}

/**
 * Parse a markdown heading line into its level, section number, and name.
 *
 * Returns `undefined` for lines that are not section headings (e.g. document titles without section numbers).
 */
export function parseHeadingLine(line: string): { level: number; section: string; name: string } | undefined {
    const match = line.match(/^(#{1,6})\s+([A-Z\d]+(?:\.\d+)*)\.\s+(.+)$/);
    if (!match) {
        return undefined;
    }

    return {
        level: match[1].length,
        section: match[2],
        name: match[3].trim(),
    };
}
