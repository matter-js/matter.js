/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { JSDOM } from "jsdom";
import { Table } from "../spec-types.js";
import { stripMarkdown } from "./md-utils.js";

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
 * Build a {@link Table} from parsed pipe table lines.
 *
 * The first row becomes the field names, remaining data rows become string cell values.
 */
export function parsePipeTable(lines: string[]): Table {
    const table: Table = {
        fields: [],
        rows: [],
        notes: [],
    };

    let headerDone = false;
    let numColumns = 0;
    let overflowColumn = -1;

    for (const line of lines) {
        const cells = splitPipeLine(line);

        if (!headerDone) {
            // First row is the header
            numColumns = cells.length;

            // Identify columns that can contain unescaped `|` in content
            for (let i = 0; i < cells.length; i++) {
                const name = cells[i].trim().toLowerCase().replace(/\W/g, "");
                if (name === "conformance" || name === "constraint") {
                    overflowColumn = i;
                }
            }

            for (const cell of cells) {
                let key = stripMarkdown(cell);
                key = key.replace(/\W/g, "").toLowerCase();
                table.fields.push(key);
            }

            table.firstRowIdentity = cells.map(c => stripMarkdown(c).trim()).join("␜");
            headerDone = true;
            continue;
        }

        // Skip separator rows
        if (isSeparatorRow(cells)) {
            continue;
        }

        // Handle overflow from unescaped `|` in content (e.g. conformance `VIS | AUD`)
        let normalizedCells = cells;
        if (cells.length > numColumns && overflowColumn >= 0) {
            const start = overflowColumn;
            const end = start + (cells.length - numColumns) + 1;
            normalizedCells = [...cells.slice(0, start), cells.slice(start, end).join(" | "), ...cells.slice(end)];
        } else if (cells.length > numColumns) {
            normalizedCells = [...cells.slice(0, numColumns - 1), cells.slice(numColumns - 1).join(" | ")];
        }

        // Single-cell rows are notes
        if (normalizedCells.length === 1 && table.fields.length > 1) {
            table.notes.push({ note: stripMarkdown(normalizedCells[0]), beforeRowIndex: table.rows.length });
            continue;
        }

        const row: Table["rows"][number] = {};
        for (let i = 0; i < table.fields.length; i++) {
            row[table.fields[i]] = i < normalizedCells.length ? stripMarkdown(normalizedCells[i]) : undefined;
        }
        table.rows.push(row);
    }

    return table;
}

/**
 * Parse an inline HTML `<table>...</table>` block into a {@link Table}.
 *
 * Uses JSDOM to parse the HTML, then extracts text from cells.  Preserves rowspan handling.
 */
export function parseHtmlTableBlock(html: string, previous?: Table): Table {
    const fragment = new JSDOM(html);
    const el = fragment.window.document.querySelector("table");
    if (!el) {
        throw new Error("No <table> element found in HTML block");
    }

    return convertHtmlTable(el, previous);
}

/**
 * Convert an HTML table element into a {@link Table} with string cell values.
 *
 * Handles rowspan, split-table identity matching, and single-cell note rows.
 */
function convertHtmlTable(el: HTMLTableElement, previous: Table | undefined): Table {
    let table: Table | undefined;
    const rowspans = Array<{ remaining: number; text: string }>();

    for (const tr of el.querySelectorAll("tr")) {
        const cells = tr.querySelectorAll("td, th");

        if (table === undefined) {
            // textContent on DOM nodes already strips HTML tags, so this is equivalent to
            // stripMarkdown for pipe table identity — the two paths never need to cross-match
            const firstRowIdentity = Array.from(cells)
                .map(cell => cell.textContent?.trim())
                .join("␜");

            if (previous?.firstRowIdentity === firstRowIdentity) {
                table = previous;
                continue;
            }

            table = {
                firstRowIdentity,
                fields: [],
                rows: [],
                notes: [],
            };
        }

        if (cells.length === 1) {
            table.notes.push({ note: cells[0].textContent?.trim() ?? "", beforeRowIndex: table.rows.length });
            for (const span of rowspans) {
                if (span.remaining) {
                    span.remaining--;
                }
            }
            continue;
        }

        if (!table.fields.length) {
            cells.forEach(cell => {
                let key = cell.textContent || "";
                key = key.replace(/\W/g, "").toLowerCase();
                table?.fields.push(key);
            });
            continue;
        }

        const row: Table["rows"][number] = {};
        let sourceIndex = 0;
        for (let i = 0; i < table.fields.length; i++) {
            if (rowspans[i]?.remaining) {
                rowspans[i].remaining--;
                row[table.fields[i]] = rowspans[i].text;
                continue;
            }

            const cell = cells.item(sourceIndex++) as HTMLTableCellElement | null;
            if (cell === null) {
                continue;
            }

            const text = cell.textContent?.trim() ?? "";
            row[table.fields[i]] = text;

            const rowspan = cell.rowSpan;
            if (typeof rowspan === "number" && rowspan > 1) {
                rowspans[i] = {
                    remaining: rowspan - 1,
                    text,
                };
            }
        }

        table.rows.push(row);
    }

    return table ?? { fields: [], rows: [], notes: [] };
}

/**
 * Detect whether a line is part of a pipe table (starts and ends with `|`).
 */
function isPipeTableLine(line: string): boolean {
    const trimmed = line.trim();
    return trimmed.startsWith("|") && trimmed.endsWith("|");
}

/**
 * Extract tables and prose from a block of markdown lines.
 *
 * Pipe tables are converted to {@link Table} objects directly.  HTML `<table>` blocks are parsed with JSDOM.
 * Everything else is returned as prose lines.
 */
export function extractTables(lines: string[]): { tables: Table[]; proseLines: string[] } {
    const tables: Table[] = [];
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
            const previous = tables.length > 0 ? tables[tables.length - 1] : undefined;
            const parsed = parseHtmlTableBlock(htmlLines.join("\n"), previous);
            if (parsed !== previous) {
                tables.push(parsed);
            }
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
