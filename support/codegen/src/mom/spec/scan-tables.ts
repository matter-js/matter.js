/**
 * @license
 * Copyright 2022-2026 Matter.js Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Table } from "./spec-types.js";

/**
 * Converts HTML tables from an HtmlReference into logical Table objects.
 */
export function* scanTables(tables: HTMLTableElement[]): Generator<Table, void> {
    let currentTable: Table | undefined;

    for (const el of tables) {
        const table = convertTable(el, currentTable);
        if (table !== currentTable) {
            if (currentTable?.rows.length) {
                yield currentTable;
            }
            currentTable = table;
        }
    }

    if (currentTable?.rows.length) {
        yield currentTable;
    }
}

/**
 * Process an individual HTML table.  Takes one of three actions:
 *
 *   - Starts a new table
 *   - Adds to previous table
 *   - Skips the table
 */
function convertTable(el: HTMLTableElement, previous: Table | undefined) {
    let table: Table | undefined;

    const rowspans = Array<{ remaining: number; el: HTMLElement }>();

    for (const tr of el.querySelectorAll("tr")) {
        const cells = tr.querySelectorAll("td, th");

        if (table === undefined) {
            // Use the first row to identify whether this is a table split across page boundaries.  For the spec the
            // first row is always replicated on subsequent pages
            //
            // Well, it was.  In 1.4 Joint Fabric Administrator DT broke this like they break everything else by not
            // using th's in their tables
            const firstRowIdentity = Array.from(cells)
                .map(cell => cell.textContent?.trim())
                .join("␜");

            const identitiesMatch = previous?.firstRowIdentity === firstRowIdentity;

            if (identitiesMatch) {
                table = previous;

                // Skip the first row as it tells us nothing new
                continue;
            }

            // Additional heuristic due to caveate above; this is ugly but works for now
            if (
                previous && // We have a previous table
                previous.fields.length === cells.length && // with the same number of columns
                previous.fields.includes("id") && // with an ID
                previous.fields.includes("name") && // and a name
                tr.querySelectorAll("th").length === 0 // and this table has no th in first row
            ) {
                table = previous;

                // Do not skip this row because it holds data
            } else {
                table = {
                    firstRowIdentity,
                    fields: [],
                    rows: [],
                    notes: [],
                };
            }
        }

        if (cells.length === 1) {
            table.notes.push(cells[0] as HTMLElement);
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

        const row = {} as Table["rows"][number];
        let sourceIndex = 0;
        for (let i = 0; i < table.fields.length; i++) {
            if (rowspans[i]?.remaining) {
                rowspans[i].remaining--;
                row[table.fields[i]] = rowspans[i].el;
                continue;
            }

            const cell = cells.item(sourceIndex++) as HTMLElement | null;
            if (cell === null) {
                continue;
            }

            row[table.fields[i]] = cell;

            const rowspan = (cell as HTMLTableCellElement)?.rowSpan;
            if (typeof rowspan === "number" && rowspan > 1) {
                rowspans[i] = {
                    remaining: rowspan - 1,
                    el: cell,
                };
            }
        }

        table.rows.push(row);
    }

    // If a table only has a single row but cells in that row wrap to multiple lines, Acrobat can get confused and
    // decide it is a multi-row table without line separators.
    //
    // Detect this case and correct by concatenating the contents of rows onto the first row
    if (table?.fields[0] !== undefined) {
        // Scan the table.  We treat as broken if there are multiple rows but the first column is empty except on the
        // first row
        const looksBorked =
            table.rows.length > 1 &&
            table.rows.every((row, i) => {
                let text = row[table?.fields[0]]?.textContent?.trim();
                if (text === "") {
                    text = undefined;
                }
                return (!i && text !== undefined) || (i && text === undefined);
            });

        // If above test succeeds, concatenate all cells in column into first
        // row and remove rows except the first
        if (looksBorked) {
            for (const colName of table.fields) {
                let target;
                for (let i = 0; i < table.rows.length; i++) {
                    const el = table.rows[i]?.[colName];
                    if (i) {
                        if (target && el) {
                            if (target === el) {
                                // We encode cells in multiple rows when there are rowspans
                                continue;
                            }
                            while (el.firstChild) {
                                target.appendChild(el.firstChild);
                            }
                        }
                    } else {
                        target = el;
                    }
                }
            }
            table.rows = table.rows.slice(0, 1);
        }
    }

    return table;
}
