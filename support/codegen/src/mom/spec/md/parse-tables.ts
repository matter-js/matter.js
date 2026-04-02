/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { JSDOM } from "jsdom";

// Shared lightweight DOM for element creation
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
const document = dom.window.document;

/**
 * Strip lightweight markdown formatting from a pipe table cell, producing plain text.
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
            // HTML subscripts: <sub>N</sub> → just N (rare, but handle)
            .replace(/<sub>([^<]*)<\/sub>/gi, "$1")
    );
}

/**
 * Split a pipe table line into cell values, trimming whitespace.
 * `| a | b | c |` → `["a", "b", "c"]`
 */
function splitPipeLine(line: string): string[] {
    const parts = line.split("|");
    // Drop first and last empty elements from the split
    return parts.slice(1, -1).map(s => s.trim());
}

/**
 * Detect whether a pipe table row is a separator row (e.g. `| --- | :---: | ---: |`).
 */
function isSeparatorRow(cells: string[]): boolean {
    return cells.every(cell => /^:?-+:?$/.test(cell));
}

/**
 * Build an `HTMLTableElement` from parsed pipe table lines.
 *
 * The first row becomes `<th>` cells in a `<thead>`, remaining data rows become `<td>` cells in a `<tbody>`.
 * Cell text has markdown formatting stripped.
 */
export function parsePipeTable(lines: string[]): HTMLTableElement {
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    let headerDone = false;
    let numColumns = 0;
    let overflowColumn = -1;

    for (const line of lines) {
        const cells = splitPipeLine(line);

        if (!headerDone) {
            // First row is the header
            numColumns = cells.length;

            // Identify columns that can contain unescaped `|` in content.
            // Conformance columns use `|` for OR expressions; constraint columns rarely do but can.
            for (let i = 0; i < cells.length; i++) {
                const name = cells[i].trim().toLowerCase().replace(/\W/g, "");
                if (name === "conformance" || name === "constraint") {
                    overflowColumn = i;
                }
            }

            const tr = document.createElement("tr");
            for (const cell of cells) {
                const th = document.createElement("th");
                th.textContent = stripMarkdown(cell);
                tr.appendChild(th);
            }
            thead.appendChild(tr);
            headerDone = true;
            continue;
        }

        // Skip separator rows
        if (isSeparatorRow(cells)) {
            continue;
        }

        // When a data row has more cells than the header, the extra cells are caused by unescaped `|` in
        // cell content (typically the Conformance column using OR expressions like `VIS | AUD`).
        // Merge overflow cells into the identified overflow column (conformance or constraint).
        let normalizedCells = cells;
        if (cells.length > numColumns && overflowColumn >= 0) {
            const excess = cells.length - numColumns;
            const start = overflowColumn;
            const end = start + excess + 1;
            normalizedCells = [...cells.slice(0, start), cells.slice(start, end).join(" | "), ...cells.slice(end)];
        } else if (cells.length > numColumns) {
            // No known overflow column — join excess into last column as fallback
            normalizedCells = [...cells.slice(0, numColumns - 1), cells.slice(numColumns - 1).join(" | ")];
        }

        const tr = document.createElement("tr");
        for (const cell of normalizedCells) {
            const td = document.createElement("td");
            td.textContent = stripMarkdown(cell);
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    }

    table.appendChild(thead);
    if (tbody.childNodes.length) {
        table.appendChild(tbody);
    }

    return table;
}

/**
 * Parse an inline HTML `<table>...</table>` block into an `HTMLTableElement` using JSDOM.
 */
export function parseHtmlTableBlock(html: string): HTMLTableElement {
    const fragment = new JSDOM(html);
    const table = fragment.window.document.querySelector("table");
    if (!table) {
        throw new Error("No <table> element found in HTML block");
    }

    // Import the node into our shared DOM so all elements share the same document
    return document.importNode(table, true) as HTMLTableElement;
}

/**
 * Detect whether a line is part of a pipe table (starts and ends with `|`).
 */
function isPipeTableLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith("|") && trimmed.endsWith("|");
}

/**
 * Extract tables and prose from a block of markdown lines (content between two headings).
 *
 * Pipe tables are converted to real `HTMLTableElement`s. HTML `<table>` blocks are parsed with JSDOM.
 * Everything else is returned as prose lines.
 */
export function extractTables(lines: string[]): { tables: HTMLTableElement[]; proseLines: string[] } {
    const tables: HTMLTableElement[] = [];
    const proseLines: string[] = [];

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trim();

        // Check for HTML table block
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
            tables.push(parseHtmlTableBlock(htmlLines.join("\n")));
            continue;
        }

        // Check for pipe table
        if (isPipeTableLine(line)) {
            const pipeLines: string[] = [];
            while (i < lines.length && isPipeTableLine(lines[i])) {
                pipeLines.push(lines[i]);
                i++;
            }
            // Need at least a header row and one other row (separator or data)
            if (pipeLines.length >= 2) {
                tables.push(parsePipeTable(pipeLines));
            } else {
                // Single pipe line is probably not a table
                proseLines.push(...pipeLines);
            }
            continue;
        }

        // Prose line
        proseLines.push(line);
        i++;
    }

    return { tables, proseLines };
}
