/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { scanTables } from "../scan-tables.js";
import { HtmlReference, Table } from "../spec-types.js";
import { parseHeadingLine, proseToElement } from "./md-utils.js";
import { parseHtmlTableBlock, parsePipeTable } from "./parse-tables.js";

/**
 * Scan a markdown document and yield {@link HtmlReference} objects for each numbered section.
 *
 * @param docRef - base reference providing document identity and path
 * @param content - markdown body text (frontmatter already stripped)
 */
export function* scanMarkdownDocument(docRef: HtmlReference, content: string): Generator<HtmlReference> {
    let currentRef: HtmlReference | undefined;
    let tables: HTMLTableElement[] | undefined;

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
                tables = undefined;
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
            if (!tables) {
                tables = initTables(currentRef);
            }
            tables.push(parseHtmlTableBlock(htmlLines.join("\n")));
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
                if (!tables) {
                    tables = initTables(currentRef);
                }
                tables.push(parsePipeTable(pipeLines));
            } else {
                // Single pipe line — treat as prose
                addProse(currentRef, proseToElement(pipeLines[0]));
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
                addProse(currentRef, proseToElement(text, admonition));
            }
            continue;
        }

        // Empty lines — skip
        if (!trimmed) {
            i++;
            continue;
        }

        // Regular prose (paragraphs, list items, nested lists)
        addProse(currentRef, proseToElement(trimmed));
        i++;
    }

    // Yield final section
    yield* emit();

    function* emit() {
        if (currentRef) {
            yield currentRef;
            currentRef = undefined;
            tables = undefined;
        }
    }
}

function isPipeTableLine(line: string): boolean {
    return line.startsWith("|") && line.endsWith("|");
}

/**
 * Detect whether blockquote text is a NOTE or WARNING admonition.
 */
function detectAdmonition(text: string): "NOTE" | "WARNING" | undefined {
    if (/^\s*(NOTE|Note)\s*[:\-]?\s/i.test(text)) {
        return "NOTE";
    }
    if (/^\s*(WARNING|Warning)\s*[:\-]?\s/i.test(text)) {
        return "WARNING";
    }
    // Default blockquotes to NOTE (common pattern in spec markdown)
    return "NOTE";
}

function addProse(ref: HtmlReference, element: HTMLElement) {
    if (!ref.prose) {
        ref.prose = [];
    }
    ref.prose.push(element);
}

/**
 * Add table support to an {@link HtmlReference}.
 *
 * Creates storage for HTML tables and installs a lazy getter on the ref to implement deferred table scanning.
 */
function initTables(ref: HtmlReference) {
    const htmlTables = [] as HTMLTableElement[];

    let logicalTables: Table[] | undefined;
    let tablesLoaded = false;

    Object.defineProperty(ref, "tables", {
        get() {
            if (!tablesLoaded) {
                tablesLoaded = true;
                logicalTables = [...scanTables(htmlTables)];
                if (!logicalTables.length) {
                    logicalTables = undefined;
                }
            }

            return logicalTables;
        },

        enumerable: true,
    });

    return htmlTables;
}
