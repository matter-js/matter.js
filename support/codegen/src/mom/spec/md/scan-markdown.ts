/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpecReference, Table } from "../spec-types.js";
import { parseHeadingLine, stripMarkdown } from "./md-utils.js";
import { parseHtmlTableBlock, parsePipeTable } from "./parse-tables.js";

/**
 * Scan a markdown document and yield {@link SpecReference} objects for each numbered section.
 *
 * @param docRef - base reference providing document identity and path
 * @param content - markdown body text (frontmatter already stripped)
 */
export function* scanMarkdownDocument(docRef: SpecReference, content: string): Generator<SpecReference> {
    let currentRef: SpecReference | undefined;

    const lines = content.split("\n");
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        // Heading line
        if (trimmed.startsWith("#")) {
            const heading = parseHeadingLine(trimmed);
            if (heading) {
                yield* emit();
                currentRef = {
                    xref: { ...docRef.xref, section: heading.section },
                    name: heading.name,
                    path: docRef.path,
                };
                i++;
                continue;
            }
            // Non-section heading (document title etc.) — skip
            i++;
            continue;
        }

        // Nothing to accumulate until we have a section
        if (!currentRef) {
            i++;
            continue;
        }

        // Code block — skip content
        if (trimmed.startsWith("```")) {
            i++;
            while (i < lines.length && !lines[i].trim().startsWith("```")) {
                i++;
            }
            i++; // skip closing ```
            continue;
        }

        // Anchor line — skip
        if (/^<a\s+id="[^"]*"\s*>\s*<\/a>\s*$/.test(trimmed)) {
            i++;
            continue;
        }

        // Bold table title like **Table N. ...** — skip
        if (/^\*\*Table\s+\d+\./.test(trimmed)) {
            i++;
            continue;
        }

        // HTML table block
        if (trimmed.toLowerCase().startsWith("<table")) {
            const htmlLines: string[] = [];
            while (i < lines.length) {
                htmlLines.push(lines[i]);
                if (lines[i].trim().toLowerCase().includes("</table>")) {
                    i++;
                    break;
                }
                i++;
            }
            const tables = ensureTables(currentRef);
            const previous = tables.length > 0 ? tables[tables.length - 1] : undefined;
            const parsed = parseHtmlTableBlock(htmlLines.join("\n"), previous);
            if (parsed !== previous) {
                tables.push(parsed);
            }
            continue;
        }

        // Pipe table
        if (isPipeTableLine(trimmed)) {
            const pipeLines: string[] = [];
            while (i < lines.length && isPipeTableLine(lines[i].trim())) {
                pipeLines.push(lines[i]);
                i++;
            }
            if (pipeLines.length >= 2) {
                const tables = ensureTables(currentRef);
                const parsed = parsePipeTable(pipeLines);
                const previous = tables.length > 0 ? tables[tables.length - 1] : undefined;

                // Merge tables with identical column structure (spec splits tables across pages/sections)
                if (previous && previous.firstRowIdentity === parsed.firstRowIdentity) {
                    const rowOffset = previous.rows.length;
                    previous.rows.push(...parsed.rows);
                    previous.notes.push(
                        ...parsed.notes.map(n => ({ ...n, beforeRowIndex: n.beforeRowIndex + rowOffset })),
                    );
                } else {
                    tables.push(parsed);
                }
            } else {
                // Single pipe line — treat as prose
                addProse(currentRef, stripMarkdown(pipeLines[0]));
            }
            continue;
        }

        // Blockquote — collect multi-line, detect admonition type
        if (trimmed.startsWith("> ") || trimmed === ">") {
            const quoteLines: string[] = [];
            while (i < lines.length && (lines[i].trim().startsWith("> ") || lines[i].trim() === ">")) {
                quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
                i++;
            }
            const text = quoteLines.join(" ").trim();
            if (text) {
                const admonition = detectAdmonition(text);
                const cleanText = stripMarkdown(text);
                addProse(currentRef, `> [!${admonition}]\n> ${cleanText}`);
            }
            continue;
        }

        // Empty lines — skip
        if (!trimmed) {
            i++;
            continue;
        }

        // Regular prose (paragraphs, list items, nested lists)
        addProse(currentRef, stripMarkdown(trimmed));
        i++;
    }

    // Yield final section
    yield* emit();

    function* emit() {
        if (currentRef) {
            yield currentRef;
            currentRef = undefined;
        }
    }
}

function isPipeTableLine(line: string): boolean {
    return line.startsWith("|") && line.endsWith("|");
}

/**
 * Detect whether blockquote text is a NOTE or WARNING admonition.
 */
function detectAdmonition(text: string): "NOTE" | "WARNING" {
    if (/^\s*(WARNING|Warning)\s*[:-]?\s/i.test(text)) {
        return "WARNING";
    }
    // Default blockquotes to NOTE
    return "NOTE";
}

function addProse(ref: SpecReference, text: string) {
    if (!ref.prose) {
        ref.prose = [];
    }
    ref.prose.push(text);
}

/**
 * Ensure a tables array exists on the ref and return it.
 */
function ensureTables(ref: SpecReference): Table[] {
    if (!ref.tables) {
        ref.tables = [];
    }
    return ref.tables;
}
